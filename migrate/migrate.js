import PocketBase from 'pocketbase';
import fs from 'fs';
import path from 'path';
import csv from 'csv-parser';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PB_URL = process.env.PB_URL || 'http://127.0.0.1:8090';
const PB_ADMIN_EMAIL = process.env.PB_ADMIN_EMAIL || 'admin@glam.com';
const PB_ADMIN_PASSWORD = process.env.PB_ADMIN_PASSWORD || 'Admin123456!';

const CSV_PATH = path.resolve(__dirname, '..', 'dresses_rows.csv');
const IMAGES_DIR = path.resolve(__dirname, '..', 'glam_images');

const pb = new PocketBase(PB_URL);

async function authenticate() {
  console.log(`Autenticando como admin: ${PB_ADMIN_EMAIL}...`);
  await pb.admins.authWithPassword(PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD);
  console.log('Autenticacion exitosa.');
}

async function ensureCollection() {
  try {
    const existing = await pb.collections.getOne('dresses');
    console.log('Coleccion "dresses" ya existe.');
    return existing;
  } catch (err) {
    if (err.status !== 404) throw err;
  }

  console.log('Creando coleccion "dresses"...');
  const collection = await pb.collections.create({
    type: 'base',
    name: 'dresses',
    listRule: '',
    viewRule: '',
    createRule: '',
    updateRule: '',
    deleteRule: '',
    fields: [
      { name: 'name', type: 'text', required: true },
      { name: 'description', type: 'text' },
      { name: 'price', type: 'number', required: true },
      { name: 'category', type: 'text', required: true },
      { name: 'sizes', type: 'json' },
      { name: 'in_stock', type: 'bool' },
      {
        name: 'images',
        type: 'file',
        maxSelect: 99,
        maxSize: 52428800,
      },
      { name: 'for_rent', type: 'bool' },
      { name: 'for_sale_by_order', type: 'bool' },
    ],
  });
  console.log('Coleccion "dresses" creada.');
  return collection;
}

function readCsv(filePath) {
  return new Promise((resolve, reject) => {
    const rows = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => rows.push(row))
      .on('end', () => resolve(rows))
      .on('error', reject);
  });
}

function getImageMimeType(filename) {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  return 'application/octet-stream';
}

function parseJsonSafe(value) {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function parseBool(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.toLowerCase() === 'true';
  return false;
}

async function createDressRecord(row) {
  const imageUrls = parseJsonSafe(row.images || '[]');
  const sizes = parseJsonSafe(row.sizes || '[]');
  const priceValue = parseFloat(row.price);

  const files = [];
  for (const url of imageUrls) {
    const filename = url.split('/').pop();
    const filepath = path.join(IMAGES_DIR, filename);

    if (!fs.existsSync(filepath)) {
      console.warn(`  Imagen no encontrada: ${filename}`);
      continue;
    }

    const buffer = fs.readFileSync(filepath);
    const mimeType = getImageMimeType(filename);
    const file = new File([buffer], filename, { type: mimeType });
    files.push(file);
  }

  const recordData = {
    name: row.name,
    description: row.description || '',
    price: isNaN(priceValue) ? 0 : priceValue,
    category: row.category || '',
    sizes: JSON.stringify(sizes),
    in_stock: parseBool(row.in_stock),
    images: files,
    for_rent: parseBool(row.for_rent),
    for_sale_by_order: parseBool(row.for_sale_by_order),
  };

  const record = await pb.collection('dresses').create(recordData);
  console.log(`  Creado: ${record.id} - ${row.name}`);
  return record;
}

async function main() {
  console.log('=== Migracion Catalogo Glam -> PocketBase ===\n');

  await authenticate();
  await ensureCollection();

  console.log(`\nLeyendo CSV: ${CSV_PATH}`);
  const rows = await readCsv(CSV_PATH);
  console.log(`Filas encontradas: ${rows.length}\n`);

  let success = 0;
  let failed = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 1;

    try {
      await createDressRecord(row);
      success++;
    } catch (err) {
      failed++;
      console.error(`\n[FILA ${rowNum}] Error al crear "${row.name}":`);
      console.error(`  Status: ${err.status || 'N/A'}`);
      console.error(`  Mensaje: ${err.message || err}`);
      if (err.data) {
        console.error(`  Detalle: ${JSON.stringify(err.data)}`);
      }
    }
  }

  console.log(`\n=== Resumen ===`);
  console.log(`Exitosos: ${success}`);
  console.log(`Fallidos:  ${failed}`);
  console.log(`Total:     ${rows.length}`);
}

main().catch((err) => {
  console.error('Error fatal:', err);
  process.exit(1);
});