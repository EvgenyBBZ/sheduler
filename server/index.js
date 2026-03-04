import express from 'express';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Инициализация базы данных
let db;
async function initDb() {
    db = await open({
        filename: path.join(__dirname, 'database.sqlite'),
        driver: sqlite3.Database
    });

    // Создаем таблицы, если их нет
    await db.exec(`
    CREATE TABLE IF NOT EXISTS Templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      shiftType TEXT NOT NULL,
      structure TEXT NOT NULL,
      metadata TEXT
    );

    CREATE TABLE IF NOT EXISTS Schedules (
      id TEXT PRIMARY KEY,
      templateId INTEGER,
      slotsData TEXT NOT NULL,
      pool TEXT DEFAULT '[]',
      assignments TEXT DEFAULT '{}',
      blockOrder TEXT DEFAULT '["Г12", "Г345"]',
      stationOrder TEXT DEFAULT '{"Г12": ["РУ", "ПК"], "Г345": ["РУ", "ПК"]}',
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(templateId) REFERENCES Templates(id)
    );
  `);

    // МИГРАЦИЯ: Добавляем колонки, если таблица Schedules уже была создана
    try { await db.run('ALTER TABLE Schedules ADD COLUMN pool TEXT DEFAULT "[]"'); } catch (e) { }
    try { await db.run('ALTER TABLE Schedules ADD COLUMN assignments TEXT DEFAULT "{}"'); } catch (e) { }
    try { await db.run('ALTER TABLE Schedules ADD COLUMN blockOrder TEXT DEFAULT \'["Г12", "Г345"]\''); } catch (e) { }
    try { await db.run('ALTER TABLE Schedules ADD COLUMN stationOrder TEXT DEFAULT \'{"Г12": ["РУ", "ПК"], "Г345": ["РУ", "ПК"]}\''); } catch (e) { }

    console.log('Database initialized');
}

// API Эндпоинты

// Получение списка всех шаблонов
app.get('/api/templates', async (req, res) => {
    try {
        const templates = await db.all('SELECT * FROM Templates');
        // Парсим JSON поля structure и metadata для удобства фронтенда
        const parsedTemplates = templates.map(t => ({
            ...t,
            structure: JSON.parse(t.structure),
            metadata: t.metadata ? JSON.parse(t.metadata) : null
        }));
        res.json(parsedTemplates);
    } catch (error) {
        console.error('Error fetching templates:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Загрузка сохраненного расписания (черновика)
app.get('/api/schedules/:id', async (req, res) => {
    try {
        const schedule = await db.get('SELECT * FROM Schedules WHERE id = ?', [req.params.id]);
        if (!schedule) {
            return res.status(404).json({ error: 'Schedule not found' });
        }
        res.json({
            ...schedule,
            slotsData: JSON.parse(schedule.slotsData),
            pool: schedule.pool ? JSON.parse(schedule.pool) : [],
            assignments: schedule.assignments ? JSON.parse(schedule.assignments) : {},
            blockOrder: schedule.blockOrder ? JSON.parse(schedule.blockOrder) : ["Г12", "Г345"],
            stationOrder: schedule.stationOrder ? JSON.parse(schedule.stationOrder) : { "Г12": ["РУ", "ПК"], "Г345": ["РУ", "ПК"] }
        });
    } catch (error) {
        console.error('Error fetching schedule:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Сохранение расписания (создание или обновление)
app.post('/api/schedules/save', async (req, res) => {
    try {
        const { id, templateId, slotsData, pool, assignments, blockOrder, stationOrder } = req.body;
        if (!id || !templateId || !slotsData) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const jsonSlotsData = JSON.stringify(slotsData);
        const jsonPool = JSON.stringify(pool || []);
        const jsonAssignments = JSON.stringify(assignments || {});
        const jsonBlockOrder = JSON.stringify(blockOrder || ["Г12", "Г345"]);
        const jsonStationOrder = JSON.stringify(stationOrder || { "Г12": ["РУ", "ПК"], "Г345": ["РУ", "ПК"] });

        const existing = await db.get('SELECT id FROM Schedules WHERE id = ?', [id]);
        if (existing) {
            await db.run(
                'UPDATE Schedules SET templateId = ?, slotsData = ?, pool = ?, assignments = ?, blockOrder = ?, stationOrder = ?, updatedAt = datetime("now", "localtime") WHERE id = ?',
                [templateId, jsonSlotsData, jsonPool, jsonAssignments, jsonBlockOrder, jsonStationOrder, id]
            );
        } else {
            await db.run(
                'INSERT INTO Schedules (id, templateId, slotsData, pool, assignments, blockOrder, stationOrder) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [id, templateId, jsonSlotsData, jsonPool, jsonAssignments, jsonBlockOrder, jsonStationOrder]
            );
        }

        res.json({ success: true, id });
    } catch (error) {
        console.error('Error saving schedule:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

initDb().then(() => {
    app.listen(PORT, () => {
        console.log(`Server listening on port ${PORT}`);
    });
}).catch(err => {
    console.error('Failed to initialize database', err);
});
