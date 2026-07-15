export type CliUpsertedGuide = {
  originalFilePath: string;
  hexFilePath: string;
  id: string;
  result: "created" | "updated";
  warnings?: string[];
};

export type CliGuideResult = {
  upserted: CliUpsertedGuide[];
  removed: string[];
};

export type CliSemanticProjectResult = {
  dirPath: string;
  result: {
    semanticProject: {
      name: string;
      [key: string]: unknown;
    };
    details: {
      contents?: {
        datasets?: unknown[];
        [key: string]: unknown;
      };
      problems?: unknown[];
      warnings?: unknown[];
      skipped?: Record<string, unknown[]>;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
};

export type CliContextPreviewResult = {
  previewId: string;
  previewLink: string;
  guides: CliGuideResult;
  semanticProjects: CliSemanticProjectResult[];
};
