import { useState, useRef, useEffect } from 'react';
import './index.css';

// Импортируем наши инструкции как текст (спасибо сборщику Vite)
import instructionRaw from '../instruction.md?raw';
import templatesRaw from '../templates.md?raw';

function App() {
  const [shiftType, setShiftType] = useState('Утро');
  const [useSubstitute, setUseSubstitute] = useState(false);
  const [namesG12, setNamesG12] = useState('');
  const [namesG345, setNamesG345] = useState('');
  const [namesSub, setNamesSub] = useState('');
  const [additionalInfo, setAdditionalInfo] = useState('');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [subNamesList, setSubNamesList] = useState([]);
  const [copyStatus, setCopyStatus] = useState('КОПИРОВАТЬ ТЕКСТ');

  // Ссылка на конец блока результатов
  const resultEndRef = useRef(null);

  // Прокрутка при обновлении результата
  useEffect(() => {
    if (resultEndRef.current) {
      resultEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [result]);

  const parseResult = (rawText) => {
    if (!rawText) return null;

    const sections = {
      g12ru: [],
      g12pk: [],
      g345ru: [],
      g345pk: []
    };

    let currentSector = ''; // 'g12' or 'g345'
    let currentPos = '';    // 'ru' or 'pk'

    const lines = rawText.split('\n');
    lines.forEach(line => {
      const cleanLine = line.trim();
      if (!cleanLine) return;

      const lowerLine = cleanLine.toLowerCase();

      // Определяем сектор
      if (lowerLine.includes('г12')) currentSector = 'g12';
      else if (lowerLine.includes('г345')) currentSector = 'g345';

      // Определяем позицию
      if (lowerLine.includes('ру') || lowerLine.includes('радиолокатор')) currentPos = 'ru';
      else if (lowerLine.includes('пк') || lowerLine.includes('процедурный')) currentPos = 'pk';

      // Если есть и сектор, и позиция, и строка похожа на смену (содержит время или начинается с тире)
      if (currentSector && currentPos && (cleanLine.startsWith('-') || / \d{2}:\d{2}/.test(cleanLine))) {
        // Убираем информацию о секторе, позиции, (XX мин), и двоеточия
        const cleaned = cleanLine
          .replace(/^- /, '')
          .replace(/\(\d+\s*мин\)/g, '')
          // Убираем Г12, Г345, РУ, ПК из самой строки
          .replace(/г12/gi, '')
          .replace(/г345/gi, '')
          .replace(/ру/gi, '')
          .replace(/пк/gi, '')
          .replace(/[:：]/g, ' ') // Убираем все двоеточия
          .replace(/\s+/g, ' ')  // Схлопываем лишние пробелы
          .trim();

        if (cleaned) {
          sections[`${currentSector}${currentPos}`].push(cleaned);
        }
      }
    });

    if (sections.g12ru.length === 0 && sections.g12pk.length === 0 &&
      sections.g345ru.length === 0 && sections.g345pk.length === 0) {
      return null;
    }

    return sections;
  };

  const handleGenerate = async () => {
    if (!namesG12.trim() || !namesG345.trim()) {
      alert("Пожалуйста, заполните списки имен для обоих секторов.");
      return;
    }

    setLoading(true);

    const g12List = namesG12.split('\n').map(n => n.trim()).filter(n => n !== '');
    const g345List = namesG345.split('\n').map(n => n.trim()).filter(n => n !== '');
    const subList = useSubstitute ? namesSub.split('\n').map(n => n.trim()).filter(n => n !== '') : [];
    setSubNamesList(subList);

    let draft = `Смена: ${shiftType}\n`;
    draft += `Всего сотрудников: ${g12List.length + g345List.length + subList.length}\n\n`;

    let counter = 1;
    draft += `Сектор Г12:\n`;
    g12List.forEach(name => {
      draft += `Чел ${counter}: ${name}\n`;
      counter++;
    });

    draft += `\nСектор Г345:\n`;
    g345List.forEach(name => {
      draft += `Чел ${counter}: ${name}\n`;
      counter++;
    });

    if (subList.length > 0) {
      draft += `\nОбщие подменные:\n`;
      subList.forEach(name => {
        draft += `Чел ${counter}: ${name}\n`;
        counter++;
      });
    }

    const modelLabel = import.meta.env.VITE_API_MODEL || 'gpt-4o-mini';
    setResult(`Запрашиваю нейросеть (${modelLabel})...\n\nВаш запрос:\n${draft}`);

    try {
      const systemPrompt = `Ты — робот-обработчик шаблонов.
Твоя единственная задача: 
1. Прочитать список сотрудников и их номера (Чел 1, Чел 2...).
2. Найти в "СПИСКЕ ШАБЛОНОВ" тот, который лучше всего подходит под запрос (по типу смены и количеству человек).
3. Взять этот шаблон "КАК ЕСТЬ" (не меняя время ни на минуту).
4. Заменить маркеры [Чел X] на соответствующие имена из списка.
5. Вывести готовое расписание. КАЖДАЯ СТРОКА ДОЛЖНА НАЧИНАТЬСЯ С "Г12 РУ:", "Г12 ПК:", "Г345 РУ:" или "Г345 ПК:".

ЗАПРЕЩЕНО:
- Пересчитывать время.
- Менять структуру блоков.
- Добавлять или удалять смены.

ИНСТРУКЦИЯ ПО ПРИВЯЗКЕ ИМЕН:
${instructionRaw}

СПИСОК ШАБЛОНОВ:
${templatesRaw}

Твой ответ должен начинаться с фразы "Использован Шаблон №[Номер]".
Затем выведи само расписание.`;

      const userPrompt = `Составь расписание, используя подходящий шаблон для следующих данных:\n${draft}`;

      const baseUrl = import.meta.env.VITE_API_BASE_URL || 'https://api.proxyapi.ru/openai/v1';
      const apiKey = import.meta.env.VITE_API_KEY;
      const modelName = import.meta.env.VITE_API_MODEL || 'gpt-4o-mini';

      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: modelName,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.1
        })
      });

      if (!response.ok) {
        throw new Error(`Ошибка HTTP: ${response.status}`);
      }

      const data = await response.json();
      const generatedText = data.choices[0]?.message?.content || 'Нет ответа от нейросети.';

      setResult(generatedText);
    } catch (error) {
      console.error(error);
      setResult(`Ошибка: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyToClipboard = () => {
    const parsed = parseResult(result);
    if (!parsed) return;

    let textToCopy = `ГРАФИК: ${shiftType}\n\n`;

    textToCopy += `--- СЕКТОР Г12 ---\n`;
    textToCopy += `РАДИОЛОКАТОР (РУ):\n` + parsed.g12ru.join('\n') + `\n\n`;
    textToCopy += `ПРОЦЕДУРНЫЙ (ПК):\n` + parsed.g12pk.join('\n') + `\n\n`;

    textToCopy += `--- СЕКТОР Г345 ---\n`;
    textToCopy += `РАДИОЛОКАТОР (РУ):\n` + parsed.g345ru.join('\n') + `\n\n`;
    textToCopy += `ПРОЦЕДУРНЫЙ (ПК):\n` + parsed.g345pk.join('\n');

    navigator.clipboard.writeText(textToCopy).then(() => {
      setCopyStatus('СКОПИРОВАНО! ✅');
      setTimeout(() => setCopyStatus('КОПИРОВАТЬ ТЕКСТ'), 2000);
    }).catch(err => {
      console.error('Ошибка копирования:', err);
      alert('Не удалось скопировать текст');
    });
  };

  const parsedData = parseResult(result);

  const renderScheduleLine = (line) => {
    if (!line) return null;

    // Проверяем, есть ли в строке имя из списка подменных
    let isSub = false;
    subNamesList.forEach(name => {
      if (line.includes(name)) isSub = true;
    });

    return (
      <div className={`schedule-line ${isSub ? 'sub-worker' : ''}`}>
        {line}
      </div>
    );
  };

  return (
    <div className="app-container">
      {/* Левая панель */}
      <div className="panel panel-left">
        <h2>Настройки</h2>

        <div className="shift-selector">
          <button className={`shift-btn ${shiftType === 'Утро' ? 'active' : ''}`} onClick={() => setShiftType('Утро')}>Утро</button>
          <button className={`shift-btn ${shiftType === 'День' ? 'active' : ''}`} onClick={() => setShiftType('День')}>День</button>
          <button className={`shift-btn ${shiftType === 'Ночь' ? 'active' : ''}`} onClick={() => setShiftType('Ночь')}>Ночь</button>
        </div>

        <div className="form-group">
          <label>Г12 Имена (1 имя - 1 строка):</label>
          <textarea value={namesG12} onChange={(e) => setNamesG12(e.target.value)} placeholder="Иван&#10;Мария" />
        </div>

        <div className="form-group">
          <label>Г345 Имена (1 имя - 1 строка):</label>
          <textarea value={namesG345} onChange={(e) => setNamesG345(e.target.value)} placeholder="Петр&#10;Анна" />
        </div>

        <div className="form-group">
          <label className="checkbox-group">
            <input type="checkbox" checked={useSubstitute} onChange={(e) => setUseSubstitute(e.target.checked)} />
            Общие подменные
          </label>
          {useSubstitute && (
            <textarea value={namesSub} onChange={(e) => setNamesSub(e.target.value)} placeholder="Сергей&#10;Елена" />
          )}
        </div>

        <button className="primary-btn" onClick={handleGenerate} disabled={loading}>
          {loading ? 'РАСЧЕТ...' : 'СФОРМИРОВАТЬ ГРАФИК'}
        </button>
      </div>

      {/* Правая панель */}
      <div className="panel panel-right">
        <div className="result-header">
          <h2>Результат</h2>
          {parsedData && (
            <button className="copy-btn" onClick={handleCopyToClipboard}>
              {copyStatus}
            </button>
          )}
        </div>

        <div className="result-area">
          {!result && <div className="placeholder-text">Заполните данные и нажмите кнопку...</div>}

          {result && !parsedData && (
            <div style={{ whiteSpace: 'pre-wrap' }}>{result}</div>
          )}

          {parsedData && (
            <div className="result-container">
              {/* Колонка Г12 */}
              <div className="result-column">
                <div className="sector-block">
                  <div className="sector-title">Сектор Г12</div>

                  <div className="position-block">
                    <div className="position-title">Радиолокатор (РУ)</div>
                    <div className="schedule-list">
                      {parsedData.g12ru.map((s, i) => <div key={i}>{renderScheduleLine(s)}</div>)}
                    </div>
                  </div>

                  <div className="position-block">
                    <div className="position-title">Процедурный (ПК)</div>
                    <div className="schedule-list">
                      {parsedData.g12pk.map((s, i) => <div key={i}>{renderScheduleLine(s)}</div>)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Колонка Г345 */}
              <div className="result-column">
                <div className="sector-block">
                  <div className="sector-title">Сектор Г345</div>

                  <div className="position-block">
                    <div className="position-title">Радиолокатор (РУ)</div>
                    <div className="schedule-list">
                      {parsedData.g345ru.map((s, i) => <div key={i}>{renderScheduleLine(s)}</div>)}
                    </div>
                  </div>

                  <div className="position-block">
                    <div className="position-title">Процедурный (ПК)</div>
                    <div className="schedule-list">
                      {parsedData.g345pk.map((s, i) => <div key={i}>{renderScheduleLine(s)}</div>)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
