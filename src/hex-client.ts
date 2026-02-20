import * as core from "@actions/core";

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
  files: {
    id: string;
    filePath: string;
  }[];
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

  private async makeRequest<T extends unknown>(
    path: string,
    method: "GET" | "POST" | "PUT" | "DELETE",
    body?: unknown,
  ): Promise<Response<T>> {
    const url = new URL(path, this.hexUrl);
    core.debug(`Making ${method} request to ${url.toString()}`);
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
      core.error(
        `Error making ${method} request to ${url.toString()}: ${text}`,
      );
      return {
        status: "error",
        message: text,
        statusCode: response.status,
      };
    }

    return {
      status: "success",
      data: (await response.json()) as T,
    };
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

  async getDraftGuides(request: ListDraftGuidesRequest) {
    const response = await this.makeRequest<ListDraftGuidesResponse>(
      `/api/v1/guides/draft/list?externalSource=${encodeURIComponent(JSON.stringify(request.externalSource))}`,
      "GET",
    );
    if (response.status === "error") {
      throw new Error(response.message);
    }
    return response.data;
  }

  async deleteGuide(guideId: string) {
    const response = await this.makeRequest<void>(
      `/api/v1/guides/draft/${guideId}`,
      "DELETE",
    );
    if (response.status === "error") {
      throw new Error(response.message);
    }
    return response.data;
  }
}
