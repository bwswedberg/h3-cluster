import path from 'path';
import fs from 'fs';
import glob from 'glob';

const args = process.argv.slice(2);
const limit = +(args.find(d => d.startsWith('limit='))?.replace('limit=', '') ?? Infinity);
const outputPath = args.find(d => d.startsWith('output='))?.replace('output=', '') ?? 'geolife.csv';

const filePaths = glob.sync(path.resolve(__dirname, '../../vector-tile-protocols/data/Geolife Trajectories 1.3/Data/**/*.plt'));

// // Create or overwrite file
fs.writeFileSync(outputPath, '', { encoding: 'utf8' });

let totalFeatures = 0;
for (let i0 = 0; i0 < filePaths.length; i0++) {
  if (i0 !== 0) {
    fs.appendFileSync(outputPath, ',\n', { encoding: 'utf8' });
  }
  const filePath = filePaths[i0]
  const id = filePath.split('/').reverse()[2]; // userId is the dir name
  const rows = fs.readFileSync(filePath, { encoding: 'utf8' })
    .split('\r\n')
    .slice(6)
    .filter(d => d)
    .map(row => {
      const d = row.split(',');
      return { lat: +d[0], lng: +d[1], id, date: `${d[5] ?? ''}` };
    })
    .filter(d => d.lat && d.lng && d.id && d.date)
    .map(d => `${d.id},${d.date},${d.lng},${d.lat}`);

  totalFeatures += rows.length;

  if (totalFeatures > limit) {
    fs.appendFileSync(outputPath, rows.slice(0, rows.length - (totalFeatures - limit)).join(',\n'), { encoding: 'utf8' });
    console.log(`Hit limit of ${limit}, done.`);
    break;
  }

  fs.appendFileSync(outputPath, rows.join(',\n'), { encoding: 'utf8' });

  console.log(`File ${i0 + 1}/${filePaths.length} (${totalFeatures})`)
}

console.log(`Total Features ${totalFeatures}`)
