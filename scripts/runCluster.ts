import fs from 'node:fs';
import path from 'node:path';
import * as h3Cluster from '../src';

const args = process.argv.slice(2);
const minPoints = +(args.find(d => d.startsWith('minPoints='))?.replace('minPoints=', '') ?? 1);
const minZScore = +(args.find(d => d.startsWith('minZScore='))?.replace('minZScore=', '') ?? 1);
const resolution = +(args.find(d => d.startsWith('resolution='))?.replace('resolution=', '') ?? 5);
const inputPath = args.find(d => d.startsWith('input='))?.replace('input=', '');
const outputPath = args.find(d => d.startsWith('output='))?.replace('output=', '') ?? 'geolife.csv';

if (!inputPath) throw new Error('Invalid input');

const data = fs.readFileSync(inputPath, 'utf-8')
  .split('\n')
  .map(str => {
    const [id, date, lng, lat] = str.split(',');
    return { lng: +lng, lat: +lat };
  });

const clusters = h3Cluster.findClusters({
  data,
  resolution,
  minPoints,
  minZScore
});

const fc = {
  type: 'FeatureCollection',
  features: clusters.map(cluster => {
    const { geometry, ...properties } = cluster;
    return {
      type: 'Feature',
      properties,
      geometry,
    }
  })
};

// make sure the dir is there
fs.mkdirSync(path.dirname(outputPath), { recursive: true });

// write the output
fs.writeFileSync(outputPath, JSON.stringify(fc), 'utf-8');

console.log('done');