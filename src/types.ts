export type CliUpsertedGuide = {
  originalFilePath: string;
  hexFilePath: string;
  id: string;
  result: "created" | "updated";
  warnings?: string[];
};

export type CliPreviewResult = {
  previewId: string;
  previewLink: string;
  upsertedGuides: CliUpsertedGuide[];
  removedGuides: string[];
};
