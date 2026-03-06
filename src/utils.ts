export function chunk<T>(array: T[], size: number): T[][] {
  return array.reduce((acc, item, index) => {
    const chunkIndex = Math.floor(index / size);
    if (!acc[chunkIndex]) {
      acc[chunkIndex] = [];
    }
    acc[chunkIndex].push(item);
    return acc;
  }, [] as T[][]);
}
