import { useState, useRef, useEffect } from 'react';
import './index.css';

// Импортируем наши инструкции как текст (спасибо сборщику Vite)
import instructionRaw from '../instruction.md?raw';
import examplesRaw from '../examples.md?raw';

function App() {
  const [shiftType, setShiftType] = useState('Утро');
  const [useSubstitute, setUseSubstitute] = useState(false);
  const [namesG12, setNamesG12] = useState('');
  const [namesG345, setNamesG345] = useState('');
  const [namesSub, setNamesSub] = useState('');
  const [additionalInfo, setAdditionalInfo] = useState('');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);

  // Ссылка на конец блока результатов
  const resultEndRef = useRef(null);

  // Прокрутка при обновлении результата
  useEffect(() => {
    if (resultEndRef.current) {
      resultEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [result]);

  const handleGenerate = async () => {
    if (!namesG12.trim() || !namesG345.trim()) {
      alert("Пожалуйста, заполните списки имен для обоих секторов.");
      return;
    }

    setLoading(true);
    let draft = `Смена: ${shiftType}\n`;
    draft += `Г12: ${namesG12.replace(/\n/g, ', ')}\n`;
    draft += `Г345: ${namesG345.replace(/\n/g, ', ')}\n`;
    if (useSubstitute) {
      draft += `Общие подменные: ${namesSub.replace(/\n/g, ', ')}\n`;
    }
    if (additionalInfo) {
      draft += `Доп. информация: \n${additionalInfo}\n`;
    }

    setResult(`Запрашиваю нейросеть (Groq). Пожалуйста, подождите...\n\nВаш запрос:\n${draft}`);

    try {
      const systemPrompt = `Ты эксперт по логике и планированию расписаний. \n\n ИНСТРУКЦИИ:\n${instructionRaw}\n\nПРИМЕРЫ СХЕМ:\n${examplesRaw}\n\nОЧЕНЬ ВАЖНО: Ты ДОЛЖЕН сначала написать свои рассуждения по шагам внутри тегов <think>...</think>.
В рассуждениях ты ОБЯЗАН:
1. Идти строго ПО ВРЕМЕНИ (например, начиная с 07:50). Планируй параллельно все 4 позиции (Г12 РУ, Г12 ПК, Г345 РУ, Г345 ПК).
2. Вести строгий ЖУРНАЛ ЗАНЯТОСТИ по каждому человеку: "Кто и до скольки сейчас занят".
3. ПРОВЕРКА НА ЛЕНЬ: Ты ДОЛЖЕН довести время на КАЖДОЙ из 4 позиций ровно до конца смены.
4. ЗАПРЕЩАЕТСЯ выдумывать смены в финальном ответе, которых не было в твоем Журнале.

ФОРМАТ ФИНАЛЬНОГО ОТВЕТА:
После закрытия тега </think> ты ОБЯЗАН выдать расписание СТРОГО В СТОЛБИК, каждая смена с новой строки, по образцу из примеров:
Г12 РУ: 14:35–16:05 Настя (90)
Г12 РУ: 16:05–17:40 Аня (95)
...
ЗАПРЕЩЕНО писать смены через запятую в одну строку! У каждой смены должна быть своя строка!`;
      const userPrompt = `Составь идеальное расписание по следующим данным, строго следуя твоим инструкциям:\n${draft}`;

      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_GROQ_API_KEY}`
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
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
      const generatedText = data.choices[0].message.content;

      setResult(`${generatedText}\n\n=================================\nВАШ ЗАПРОС:\n${draft}`);
    } catch (error) {
      console.error(error);
      setResult(`Произошла ошибка при обращении к нейросети: ${error.message}\n\nВаш запрос:\n${draft}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="stars"></div>
      <div className="app-container">

        {/* Левая панель с настройками */}
        <div className="panel panel-left">
          <h2>Настройки смены</h2>

          <div className="shift-selector">
            <button
              className={`shift-btn ${shiftType === 'Утро' ? 'active' : ''}`}
              onClick={() => setShiftType('Утро')}
            >Утро</button>
            <button
              className={`shift-btn ${shiftType === 'День' ? 'active' : ''}`}
              onClick={() => setShiftType('День')}
            >День</button>
            <button
              className={`shift-btn ${shiftType === 'Ночь' ? 'active' : ''}`}
              onClick={() => setShiftType('Ночь')}
            >Ночь</button>
          </div>

          <div className="form-group">
            <label>Сотрудники Г12 (каждое имя с новой строки):</label>
            <textarea
              value={namesG12}
              onChange={(e) => setNamesG12(e.target.value)}
              placeholder="Настя&#10;Инна&#10;Ира"
            />
          </div>

          <div className="form-group">
            <label>Сотрудники Г345 (каждое имя с новой строки):</label>
            <textarea
              value={namesG345}
              onChange={(e) => setNamesG345(e.target.value)}
              placeholder="Андрей&#10;Максим&#10;Женя"
            />
          </div>

          <div className="form-group">
            <label className="checkbox-group">
              <input
                type="checkbox"
                checked={useSubstitute}
                onChange={(e) => setUseSubstitute(e.target.checked)}
              />
              Общая подмена
            </label>

            {useSubstitute && (
              <textarea
                value={namesSub}
                onChange={(e) => setNamesSub(e.target.value)}
                placeholder="Влад&#10;Сергей"
                style={{ marginTop: '0.5rem' }}
              />
            )}
          </div>

          <div className="form-group">
            <label>Дополнительная информация (допуски, проверки, тренажеры):</label>
            <textarea
              value={additionalInfo}
              onChange={(e) => setAdditionalInfo(e.target.value)}
              placeholder="Трен: 11-13 Инна&#10;Сидоров (2ч)"
            />
          </div>

          <button
            className="primary-btn"
            onClick={handleGenerate}
            disabled={loading}
            style={{ opacity: loading ? 0.7 : 1, cursor: loading ? 'wait' : 'pointer' }}
          >
            {loading ? 'Идет расчет...' : 'Сгенерировать расписание'}
          </button>
        </div>

        {/* Правая панель с результатом */}
        <div className="panel panel-right">
          <h2>Результат</h2>
          <div className="result-area">
            {result ? result : <div className="placeholder-text">Заполните данные слева и нажмите «Сгенерировать»...</div>}
            <div ref={resultEndRef} />
          </div>
        </div>
      </div>
    </>
  );
}

export default App;
