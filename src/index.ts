import h3 from 'h3-js';

type Memo = Map<string, { total: number, zScore: number; label?: number }>;

type Cluster = { 
  label: number; 
  total: number; 
  geometry: Record<any, any>;
};

interface FindClustersInput {
  data: { lng: number, lat: number }[];
  resolution: number;
  minPoints?: number;
  minZScore?: number;
}

const NOISE_LABEL = -1;

export const findClusters = ({ data, resolution, minPoints, minZScore }: FindClustersInput) => {
  // memo with - key as h3 cell hash, value as cell stats
  const memo: Memo = new Map();

  // rollup the data into h3 cell memo
  for (const d of data) {
    const cell = h3.latLngToCell(d.lat, d.lng, resolution);
    let item = memo.get(cell);
    if (!item) {
      // assign a temp value for total and zScore
      item = { total: 0, zScore: 0 };
    }
    item.total += 1;
    memo.set(cell, item);
  }

  // caculate the mean
  const mean = data.length / memo.size;

  // calculate variation
  let variation = 0;
  for (const item of memo.values()) {
    variation += Math.pow(item.total - mean, 2)
  }

  // calculate standard deviation
  const stdDev = Math.sqrt(variation / memo.size);

  // calculate z-scores for each cell
  for (const item of memo.values()) {
    item.zScore = (item.total - mean) / stdDev;
  }

  const clusters: Cluster[] = [];

  for (const rootCell of memo.keys()) {
    // use an explicit `set` to avoid stackoverflow error which 
    // could be caused by recursion. use a `set` over a `stack`
    // to avoid pushing duplicate cells
    const candidateCells = new Set([rootCell]);

    // contains all cells that are cluster members
    const clusterCells: string[] = [];

    const label = clusters.length;

    while (candidateCells.size) {
      // pop a cell out of the `set`. no concise way to do this in typescript
      const cell = candidateCells.keys().next().value;
      candidateCells.delete(cell);

      // this is impossible to get to because the while loop condition
      // added here to keep typescript happy
      if (!cell) break;

      const item = memo.get(cell);

      // this is impossible to get to because we know it's in the memo
      // and because of how we push neighbors onto the stack
      // added here to keep typescript happy
      if (!item) continue;
    
      // item already visited
      if (item.label != null) continue;
    
      // item z-score threshold is defined AND item does not meet threshold
      if (minZScore != null && item.zScore < minZScore) {
        // assign noise label to prevent revisit
        item.label = NOISE_LABEL;
        continue;
      }
    
      // item min points threshold is defined AND item does not meet threshold
      if (minPoints != null && item.total < minPoints) {
        // assign noise label to prevent revisit
        item.label = NOISE_LABEL;
        continue;
      }
    
      // mark label to prevent revisiting
      item.label = label;

      // add cell to cluster
      clusterCells.push(cell);
    
      // get the neighboring cells within 1 cell distance
      const neighborCells = h3.gridDisk(cell, 1);
    
      // check neighbors to see if they are cluster candiates
      for (const neighborCell of neighborCells) {
        // a preflight condition which reduces the amount of visited cells
        // this keeps the `set` size size much lower
        const neighborItem = memo.get(neighborCell);
        if (
          neighborItem != null && 
          neighborItem.label == null
        ) {
          // add cell to visit
          candidateCells.add(neighborCell);
        }
      }
    }

    if (clusterCells.length) {
      const total = clusterCells.reduce((acc, cur) => {
        return acc + (memo.get(cur)?.total ?? 0);
      }, 0);

      const geometry = {
        type: 'MultiPolygon',
        coordinates: h3.cellsToMultiPolygon(clusterCells, true)
      };

      clusters.push({
        total,
        label,
        geometry
      });
    }
  }

  return clusters;
};
