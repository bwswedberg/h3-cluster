import h3 from 'h3-js';

type Memo = Map<string, { total: number, zScore: number; label?: number }>;

interface FindClustersInput {
  data: { lng: number, lat: number }[];
  resolution: number;
  minPoints?: number;
  minZScore?: number;
}

const NOISE_LABEL = -1;

export const findClusters = ({ data, resolution, minPoints, minZScore }: FindClustersInput) => {
  const memo: Memo = new Map();

  for (const d of data) {
    const cell = h3.latLngToCell(d.lat, d.lng, resolution);
    let item = memo.get(cell);
    if (!item) {
      item = { total: 0, zScore: 0 };
    }
    item.total += 1;
    memo.set(cell, item);
  }

  // caculate the mean and standard dev for cell totals
  // TODO: migrate this code into the initial pass
  const mean = Array.from(memo.values()).reduce((acc, cur) => acc + cur.total, 0) / memo.size;
  const stdDev = Math.sqrt(
    Array.from(memo.values()).reduce((acc, cur) => acc + Math.pow(cur.total - mean, 2), 0) / memo.size
  );

  // create options obj for visiting cells
  const visitCellOptions = {
    minPoints,
    minZScore
  };

  // cluster labels
  let label = 0;

  for (const [cell, item] of memo) {
    const origLabel = item.label;

    // assign true z-score for cluster criteria 
    item.zScore = (item.total - mean) / stdDev;

    visitCell(memo, cell, label, visitCellOptions);

    // if cell didn't have a label and now it has a cluster label 
    // then we should begin a new cluster
    if (origLabel == null && item.label != NOISE_LABEL) {
      label += 1;
    }
  }

  const cellsByClusterLabel: Record<string, { label: number; total: number; cells: string[] }> = {};

  // rollup all cells by their label
  for (const [cell, item] of memo) {
    // skip the cell if it's a noise label
    // added null check to for typescript although this would be impossible to reach
    if (item.label === NOISE_LABEL || item.label == null) continue;

    if (!cellsByClusterLabel[item.label]) {
      // create a cluster if it doesn't exist
      cellsByClusterLabel[item.label] = {
        label: item.label,
        total: 0,
        cells: [],
      };
    }

    // rollup cells values into cluster
    cellsByClusterLabel[item.label].cells.push(cell);
    cellsByClusterLabel[item.label].total += item.total;
  }
  
  // return with the cells converted into geojson geometry
  return Object.values(cellsByClusterLabel).map(cluster => {
    const { cells, ...props } = cluster;
    // convert cells into geojson geometry
    const geometry = {
      type: 'MultiPolygon',
      coordinates: h3.cellsToMultiPolygon(cells, true)
    }
    return { ...props, geometry };
  });
};

const visitCell = (
  memo: Memo, 
  cell: string, 
  label: number, 
  options: { minPoints?: number, minZScore?: number }
) => {
  const item = memo.get(cell);

  // item isn't in memo
  if (!item) return;

  // item already visited
  if (item.label != null) return;

  // item z-score threshold is defined AND item does not meet threshold
  if (options.minZScore != null && item.zScore < options.minZScore) {
    // assign noise label to prevent revisit
    item.label = NOISE_LABEL;
    return;
  }

  // item min points threshold is defined AND item does not meet threshold
  if (options.minPoints != null && item.total < options.minPoints) {
    // assign noise label to prevent revisit
    item.label = NOISE_LABEL;
    return;
  }

  // assign item to cluster
  item.label = label;

  // get the neighboring cells within 1 cell distance
  const neighboringCells = h3.gridDisk(cell, 1);

  for (const neighboringCell of neighboringCells) {
    // recurse
    visitCell(memo, neighboringCell, label, options);
  }
}
