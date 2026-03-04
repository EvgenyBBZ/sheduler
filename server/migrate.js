import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function migrate() {
    const db = await open({
        filename: path.join(__dirname, 'database.sqlite'),
        driver: sqlite3.Database
    });

    // Убедимся, что таблица существует
    await db.exec(`
    CREATE TABLE IF NOT EXISTS Templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      shiftType TEXT NOT NULL,
      structure TEXT NOT NULL,
      metadata TEXT
    );
  `);

    // Очистим перед миграцией
    await db.exec(`DELETE FROM Templates`);
    console.log('Cleared existing templates');

    const mdPath = path.join(__dirname, '..', 'templates.md');
    const content = fs.readFileSync(mdPath, 'utf8');

    // Разбиваем по заголовкам ## Шаблон
    const templateBlocks = content.split(/##\s+Шаблон\s+№\d+:\s+/).filter(b => b.trim());

    let slotIdCounter = 1;

    for (const block of templateBlocks) {
        if (block.startsWith('#') || block.startsWith('В этот файл')) continue; // Пропуск шапки

        const lines = block.split('\n');
        let title = lines[0].trim();
        let shiftType = 'Утро';
        if (title.toLowerCase().includes('день')) shiftType = 'День';
        if (title.toLowerCase().includes('ночь')) shiftType = 'Ночь';

        const structure = [];
        let currentSector = '';
        let currentPosition = '';

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            // Определение сектора
            if (trimmed.startsWith('#### Сектор Г12')) currentSector = 'Г12';
            else if (trimmed.startsWith('#### Сектор Г345')) currentSector = 'Г345';

            // Определение позиции
            if (trimmed.startsWith('**Позиция РУ:**')) currentPosition = 'РУ';
            else if (trimmed.startsWith('**Позиция ПК:**')) currentPosition = 'ПК';

            // Парсинг слота: - 21:35 – 23:20 (105 мин) : `[Чел 1]`
            if (trimmed.startsWith('-') && trimmed.includes(':')) {
                const timeMatch = trimmed.match(/(\d{2}:\d{2})\s*[–-]?\s*(\d{2}:\d{2})/);
                const personMatch = trimmed.match(/\[Чел \d+\]/);

                if (timeMatch && personMatch && currentSector && currentPosition) {
                    structure.push({
                        id: `slot_${slotIdCounter++}`,
                        sector: currentSector,
                        position: currentPosition,
                        timeStart: timeMatch[1],
                        timeEnd: timeMatch[2],
                        assignedTo: personMatch[0]
                    });
                }
            }
        }

        if (structure.length > 0) {
            await db.run(
                'INSERT INTO Templates (title, shiftType, structure, metadata) VALUES (?, ?, ?, ?)',
                [title, shiftType, JSON.stringify(structure), JSON.stringify({ slotsCount: structure.length })]
            );
            console.log(`Migrated template: ${title} (${structure.length} slots)`);
        }
    }

    console.log('Migration completed successfully');
}

migrate().catch(console.error);
