export type CliGuideResult = {
  name: string;
  result: "created" | "updated" | "deleted";
  warnings?: string[];
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

export type CliEvalSuiteResult = {
  path: string;
  previewId: string;
  evalSuite: {
    id: string;
    publicIdentifier: string;
  };
  evalSuiteVersion: {
    id: string;
  };
  result: "created" | "noop" | "updated";
};

export type CliContextPreviewResult = {
  previewId: string;
  previewLink: string;
  guides: CliGuideResult[];
  semanticProjects: CliSemanticProjectResult[];
  evalSuites?: CliEvalSuiteResult[];
};
