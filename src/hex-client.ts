import * as core from "@actions/core";
import { chunk } from "./utils";

const LIMIT_PER_PAGE = 20;
const DEFAULT_BATCH_SIZE = 2;

type Response<T> =
  | {
      status: "success";
      data: T;
    }
  | {
      status: "error";
      message: string;
      statusCode: number;
    };

type ListDraftGuidesRequest = {
  externalSource: {
    source: "github";
    base: string;
    owner: string;
    repo: string;
  };
};

type ListDraftGuidesResponse = {
  values: {
    id: string;
    filePath: string;
  }[];
  pagination: {
    after: string | null;
    before: string | null;
  };
};

type UpsertDraftGuideRequest = {
  forceWrite?: boolean;
  files: {
    filePath: string;
    contents: string;
    externalSource: {
      source: "github";
      base: string;
      owner: string;
      repo: string;
      commitHash: string;
      branch: string;
      path: string;
    };
  }[];
};

type UpsertDraftGuideResponse = {
  files: {
    id: string;
    filePath: string;
  }[];
};

type PublishDraftGuideRequest = {
  orgGuideFileIds: string[];
};

type PublishDraftGuideResponse = {
  message: string;
  publishedGuides: {
    id: string;
    filePath: string;
  }[];
};

export class HexClient {
  constructor(
    private readonly hexUrl: string,
    private readonly hexToken: string,
  ) {}

  private async makeRequestBase(
    path: string,
    method: "GET" | "POST" | "PUT" | "DELETE",
    body?: unknown,
  ): Promise<Response<Awaited<ReturnType<typeof fetch>>>> {
    const url = new URL(path, this.hexUrl).toString();
    core.debug(`Making ${method} request to ${url}`);
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.hexToken}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const text = await response.text();
      let maybeParsedJsonText = null;

      try {
        maybeParsedJsonText = JSON.stringify(JSON.parse(text), null, 2);
      } catch (e) {
        maybeParsedJsonText = text;
      }
      core.error(`Error making ${method} request to ${url.toString()}`);
      if (response.status === 401) {
        const isUsingBaseHexUrl = this.hexUrl === "https://app.hex.tech";
        const additionalMessage = isUsingBaseHexUrl
          ? ", and if you are using a single tenant / EU / HIPAA instance, ensure the hex_url is set correctly (e.g. https://eu.hex.tech)"
          : ".";
        core.error(
          `Unauthorized - please check your token and ensure it has the Guides write scope${additionalMessage}`,
        );
      } else {
        core.error(maybeParsedJsonText);
      }
      return {
        status: "error",
        message: text,
        statusCode: response.status,
      };
    }

    return {
      status: "success",
      data: response,
    };
  }

  private async makeRequest<T extends unknown>(
    path: string,
    method: "GET" | "POST" | "PUT" | "DELETE",
    body?: unknown,
  ): Promise<Response<T>> {
    const baseResponse = await this.makeRequestBase(path, method, body);
    if (baseResponse.status === "error") {
      return baseResponse;
    } else {
      return {
        status: "success",
        data: (await baseResponse.data.json()) as T,
      };
    }
  }
  private async makeRequestWithoutResponse(
    path: string,
    method: "GET" | "POST" | "PUT" | "DELETE",
    body?: unknown,
  ): Promise<Response<string>> {
    const baseResponse = await this.makeRequestBase(path, method, body);
    if (baseResponse.status === "error") {
      return baseResponse;
    } else {
      return {
        status: "success",
        data: await baseResponse.data.text(),
      };
    }
  }
  async upsertDraftGuides(body: UpsertDraftGuideRequest) {
    const response = await this.makeRequest<UpsertDraftGuideResponse>(
      "/api/v1/guides/draft",
      "PUT",
      body,
    );
    if (response.status === "error") {
      throw new Error(response.message);
    }
    return response.data;
  }

  async upsertDraftGuidesInBatches(
    body: UpsertDraftGuideRequest,
    options: { batchSize?: number } = {},
  ) {
    const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
    const fileBatches = chunk(body.files, batchSize);
    const finalResponse: UpsertDraftGuideResponse = { files: [] };

    for (const fileBatch of fileBatches) {
      core.info(`Upserting batch of ${fileBatch.length} guides`);
      const batchBody = {
        ...body,
        files: fileBatch,
      };
      const response = await this.makeRequest<UpsertDraftGuideResponse>(
        "/api/v1/guides/draft",
        "PUT",
        batchBody,
      );
      if (response.status === "error") {
        throw new Error(response.message);
      }
      finalResponse.files.push(...response.data.files);
    }

    return finalResponse;
  }

  async publishDraftGuides(guides: PublishDraftGuideRequest) {
    const response = await this.makeRequest<PublishDraftGuideResponse>(
      "/api/v1/guides/publish",
      "POST",
      guides,
    );
    if (response.status === "error") {
      throw new Error(response.message);
    }
    return response.data;
  }

  async getDraftGuides(request: ListDraftGuidesRequest, after?: string | null) {
    let url = `/api/v1/guides/draft/list?externalSource=${encodeURIComponent(JSON.stringify(request.externalSource))}&limit=${LIMIT_PER_PAGE}`;
    if (after != null) {
      url += `&after=${encodeURIComponent(after)}`;
    }
    const response = await this.makeRequest<ListDraftGuidesResponse>(
      url,
      "GET",
    );
    if (response.status === "error") {
      throw new Error(response.message);
    }
    return response.data;
  }

  async getAllDraftGuides(
    request: ListDraftGuidesRequest,
  ): Promise<ListDraftGuidesResponse["values"]> {
    const allGuides: ListDraftGuidesResponse["values"] = [];
    let after: string | null = null;
    while (true) {
      const page = await this.getDraftGuides(request, after);
      allGuides.push(...page.values);
      after = page.pagination.after;
      if (after == null) {
        break;
      }
    }
    return allGuides;
  }

  async deleteGuide(guideId: string) {
    const response = await this.makeRequestWithoutResponse(
      `/api/v1/guides/draft/${guideId}`,
      "DELETE",
    );
    if (response.status === "error") {
      throw new Error(response.message);
    }
    return response.data;
  }
}
