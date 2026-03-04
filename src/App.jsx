import { useState, useEffect } from 'react';
import './index.css';
import { checkRules } from './validator';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

// ─── Drag payload helpers ──────────────────────────────────────────
const encodePool = (name) => `pool:${name}`;
const encodeSlot = (marker, name) => `slot:${marker}:${name}`;
const decodeDrag = (str) => {
  if (!str) return null;
  if (str.startsWith('pool:')) return { source: 'pool', name: str.slice(5) };
  if (str.startsWith('slot:')) {
    const rest = str.slice(5);
    const sep = rest.indexOf(':');
    return { source: 'slot', marker: rest.slice(0, sep), name: rest.slice(sep + 1) };
  }
  return null;
};

// ─── EmployeePool component ────────────────────────────────────────
function EmployeePool({ pool, onAdd, onRemove, onDragStart }) {
  const [inputValue, setInputValue] = useState('');

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      const name = inputValue.trim();
      if (name) { onAdd(name); setInputValue(''); }
    }
  };

  return (
    <div className="employee-pool">
      <div className="pool-input-row">
        <input
          type="text"
          className="pool-input"
          placeholder="Введите имя и нажмите Enter"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
        />
      </div>
      <div className="pool-chips">
        {pool.map((name) => (
          <div
            key={name}
            className="employee-chip"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('text/plain', encodePool(name));
              e.dataTransfer.effectAllowed = 'move';
              onDragStart();
            }}
            onDragEnd={() => onDragStart(false)}
          >
            <span>{name}</span>
            <button className="chip-remove" onClick={() => onRemove(name)} title="Удалить">✕</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── App ───────────────────────────────────────────────────────────
function App() {
  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [scheduleData, setScheduleData] = useState(null);
  const [scheduleId, setScheduleId] = useState('');

  // pool: [имена]
  const [pool, setPool] = useState([]);

  // assignments: { "[Чел 1]": "Имя1", "[Чел 2]": "Имя2" }
  const [assignments, setAssignments] = useState({});

  const [saving, setSaving] = useState(false);
  const [copyStatus, setCopyStatus] = useState('КОПИРОВАТЬ ТЕКСТ');
  const [errors, setErrors] = useState({});
  const [isDragging, setIsDragging] = useState(false);
  const [hoveredMarker, setHoveredMarker] = useState(null);

  // ── Load data ──
  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        const res = await fetch(`${API_URL}/templates`);
        if (res.ok) setTemplates(await res.json());
      } catch (err) { console.error('Failed to load templates', err); }
    };
    fetchTemplates();

    const savedId = localStorage.getItem('schedulerDraftId');
    if (savedId) loadDraft(savedId);
  }, []);

  const loadDraft = async (id) => {
    try {
      const res = await fetch(`${API_URL}/schedules/${id}`);
      if (!res.ok) return;
      const data = await res.json();
      setScheduleId(data.id);
      setSelectedTemplateId(data.templateId.toString());
      setScheduleData(data.slotsData);
      if (data.pool) setPool(data.pool);
      if (data.assignments) setAssignments(data.assignments);
    } catch (err) { console.error('Failed to load draft', err); }
  };

  // ── Template selection ──
  const handleTemplateSelect = (e) => {
    const tId = e.target.value;
    setSelectedTemplateId(tId);
    if (!tId) { setScheduleData(null); return; }
    const template = templates.find(t => t.id.toString() === tId);
    if (template) {
      const slots = JSON.parse(JSON.stringify(template.structure));
      setScheduleData(slots);
      setAssignments({});
      setScheduleId('');
      localStorage.removeItem('schedulerDraftId');
    }
  };

  const addToPool = (name) => {
    if (!name) return;
    setPool(prev => pool.includes(name) ? prev : [...prev, name]);
  };

  const removeFromPool = (name) => {
    setPool(prev => prev.filter(n => n !== name));
  };

  // ── Validation Engine ──
  useEffect(() => {
    if (!scheduleData || !assignments) return;
    try {
      const vResults = checkRules(scheduleData, assignments);
      setErrors(vResults || {});
    } catch (err) {
      console.error('Validation error:', err);
    }
  }, [scheduleData, assignments]);

  // ── Swap Logic (Swapping data labels, keeping UI labels static) ──
  const handleSwapSectors = () => {
    setScheduleData(prev => prev.map(s => ({
      ...s,
      sector: s.sector === 'Г12' ? 'Г345' : 'Г12'
    })));
  };

  const handleSwapWorkstations = (sectorToSwap) => {
    setScheduleData(prev => prev.map(s => {
      if (s.sector !== sectorToSwap) return s;
      return {
        ...s,
        position: s.position === 'РУ' ? 'ПК' : 'РУ'
      };
    }));
  };

  // ── Time edit ──
  const handleTimeChange = (id, field, value) => {
    setScheduleData(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
  };

  // ─── DROP LOGIC ────────────────────────────────────────────────
  const handleDropOnSlot = (e, targetMarker, targetSlotId) => {
    e.preventDefault();
    setIsDragging(false);
    setHoveredMarker(null);
    const raw = e.dataTransfer.getData('text/plain');
    const drag = decodeDrag(raw);
    if (!drag) return;

    const isCtrl = e.ctrlKey || e.metaKey;

    if (isCtrl) {
      // РУЧНОЙ ПЕРЕНОС (Override only this slot)
      setScheduleData(prev => prev.map(s => {
        if (s.id !== targetSlotId) return s;
        return { ...s, overrideName: drag.name };
      }));
      // Remove from pool if it came from pool
      if (drag.source === 'pool') removeFromPool(drag.name);
      return;
    }

    if (drag.source === 'pool') {
      // Пул -> Слот (глобальная привязка к маркеру)
      const oldName = assignments[targetMarker];
      setAssignments(prev => ({ ...prev, [targetMarker]: drag.name }));
      setPool(p => {
        const updated = p.filter(n => n !== drag.name);
        if (oldName) return [...updated, oldName];
        return updated;
      });
    } else if (drag.source === 'slot') {
      // Слот -> Слот (Swap ролей)
      const sourceMarker = drag.marker;
      if (sourceMarker === targetMarker) return;

      const sourceName = assignments[sourceMarker];
      const targetName = assignments[targetMarker];

      setAssignments(prev => ({
        ...prev,
        [sourceMarker]: targetName || null,
        [targetMarker]: sourceName || null
      }));
    }
  };

  const handleResetOverride = (slotId) => {
    setScheduleData(prev => prev.map(s =>
      s.id === slotId ? { ...s, overrideName: null } : s
    ));
  };

  const handleDropOnPool = (e) => {
    e.preventDefault();
    setIsDragging(false);
    setHoveredMarker(null);
    const raw = e.dataTransfer.getData('text/plain');
    const drag = decodeDrag(raw);
    if (!drag || drag.source !== 'slot') return;

    // Слот -> Пул (освобождение роли)
    const marker = drag.marker;
    const nameToMove = assignments[marker];
    if (nameToMove) {
      setAssignments(prev => {
        const next = { ...prev };
        delete next[marker];
        return next;
      });
      addToPool(nameToMove);
    }
  };

  // ── Save ──
  const saveDraft = async () => {
    if (!scheduleData || !selectedTemplateId) return;
    setSaving(true);
    const currentId = scheduleId || `draft_${Date.now()}`;
    try {
      const res = await fetch(`${API_URL}/schedules/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: currentId,
          templateId: Number(selectedTemplateId),
          slotsData: scheduleData,
          pool,
          assignments
        })
      });
      if (res.ok) {
        setScheduleId(currentId);
        localStorage.setItem('schedulerDraftId', currentId);
        const btn = document.getElementById('save-btn');
        if (btn) {
          btn.innerText = 'СОХРАНЕНО ✓';
          setTimeout(() => { btn.innerText = 'СОХРАНИТЬ ПРОГРЕСС'; }, 2000);
        }
      }
    } catch (err) { console.error('Save failed', err); }
    setSaving(false);
  };

  // ── Copy to clipboard ──
  const handleCopyToClipboard = () => {
    if (!scheduleData) return;

    // Проверка ошибок перед копированием
    const hasErrors = Object.values(errors).some(e => e.type === 'error' || e.type === 'warning');
    if (hasErrors) {
      if (!window.confirm('В расписании обнаружены ошибки или предупреждения. Вы уверены, что хотите скопировать его в буфер обмена?')) {
        return;
      }
    }

    const grouped = { Г12: { РУ: [], ПК: [] }, Г345: { РУ: [], ПК: [] } };

    // Сортируем данные по времени, чтобы в итоговом тексте они шли по порядку (хронологически)
    const sortedData = [...scheduleData].sort((a, b) => a.timeStart.localeCompare(b.timeStart));

    sortedData.forEach(slot => {
      // ПРИОРИТЕТ: overrideName (ручной перенос) > assignments (глобальная роль) > метка роли
      const assignedName = slot.overrideName || assignments[slot.assignedTo];
      const display = assignedName || slot.assignedTo;

      if (grouped[slot.sector] && grouped[slot.sector][slot.position]) {
        grouped[slot.sector][slot.position].push(`${slot.timeStart} – ${slot.timeEnd} : ${display}`);
      }
    });

    const t = templates.find(t => t.id.toString() === selectedTemplateId);
    let text = `ГРАФИК: ${t?.title ?? ''}\n\n`;
    ['Г12', 'Г345'].forEach(sec => {
      text += `--- СЕКТОР ${sec} ---\n`;
      text += `РАДИОЛОКАТОР (РУ):\n` + grouped[sec]['РУ'].join('\n') + `\n\n`;
      text += `ПРОЦЕДУРНЫЙ (ПК):\n` + grouped[sec]['ПК'].join('\n') + `\n\n`;
    });

    navigator.clipboard.writeText(text).then(() => {
      setCopyStatus('СКОПИРОВАНО! ✅');
      setTimeout(() => setCopyStatus('КОПИРОВАТЬ ТЕКСТ'), 2000);
    });
  };

  // ── Render ──
  const renderSlotsGroup = (sector, position) => {
    if (!scheduleData) return null;
    const slots = scheduleData.filter(s => s.sector === sector && s.position === position);

    return (
      <div className="position-block">
        <div className="position-title">{position === 'РУ' ? 'Радиолокатор (РУ)' : 'Процедурный (ПК)'}</div>
        <div className="schedule-list">
          {slots.map(slot => {
            const assignedName = slot.overrideName || assignments[slot.assignedTo];
            const isFull = !!assignedName;
            const isOverridden = !!slot.overrideName;
            const isMainDropTarget = hoveredMarker === slot.assignedTo;
            const isRelatedDropTarget = isDragging && hoveredMarker && hoveredMarker === slot.assignedTo;

            return (
              <div
                key={slot.id}
                className={`atomic-slot 
                  ${!isFull && isDragging ? 'slot-drop-target' : ''} 
                  ${isRelatedDropTarget ? 'slot-highlight-marker' : ''}
                  ${isOverridden ? 'slot-overridden' : ''}
                `}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (hoveredMarker !== slot.assignedTo) setHoveredMarker(slot.assignedTo);
                }}
                onDrop={(e) => handleDropOnSlot(e, slot.assignedTo, slot.id)}
                onDragLeave={() => setHoveredMarker(null)}
              >
                {isOverridden && <div className="override-indicator" title="Ручное переопределение">★</div>}

                <div className="slot-time-inputs">
                  <input type="time" value={slot.timeStart} className="time-input"
                    onChange={(e) => handleTimeChange(slot.id, 'timeStart', e.target.value)} />
                  <span className="time-sep">–</span>
                  <input type="time" value={slot.timeEnd} className="time-input"
                    onChange={(e) => handleTimeChange(slot.id, 'timeEnd', e.target.value)} />
                </div>

                <div
                  className={`slot-assigned ${isFull ? 'slot-filled' : 'slot-placeholder'}`}
                  draggable={isFull}
                  onDragStart={isFull ? (e) => {
                    const dragName = slot.overrideName || assignedName;
                    e.dataTransfer.setData('text/plain', encodeSlot(slot.assignedTo, dragName));
                    setIsDragging(true);
                    setHoveredMarker(slot.assignedTo);
                  } : undefined}
                  onDragEnd={() => { setIsDragging(false); setHoveredMarker(null); }}
                >
                  {isOverridden && (
                    <button className="override-reset-btn" onClick={() => handleResetOverride(slot.id)} title="Сбросить к шаблону">
                      🔗
                    </button>
                  )}
                  <span className="assigned-name">{assignedName || slot.assignedTo}</span>
                </div>

                {/* Validation icon */}
                {errors[slot.id] && (
                  <div
                    className="slot-validation"
                    data-tooltip={errors[slot.id].message}
                  >
                    {errors[slot.id].type === 'error'
                      ? <span className="slot-error-icon">!</span>
                      : <span className="slot-warning-icon">!</span>
                    }
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="app-container">
      <div className="panel panel-left">
        <h2>Настройки</h2>
        <div className="form-group">
          <label>Шаблон:</label>
          <select value={selectedTemplateId} onChange={handleTemplateSelect} className="template-select">
            <option value="">-- Выберите шаблон --</option>
            {templates.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Пул сотрудников:</label>
          <EmployeePool pool={pool} onAdd={addToPool} onRemove={removeFromPool} onDragStart={(v = true) => setIsDragging(v)} />
        </div>
        <div className={`pool-drop-zone ${isDragging ? 'pool-drop-active' : ''}`} onDragOver={e => e.preventDefault()} onDrop={handleDropOnPool}>
          ↩ Вернуть в пул
        </div>
        <button id="save-btn" className="primary-btn" onClick={saveDraft} disabled={saving || !scheduleData}>
          {saving ? 'СОХРАНЕНИЕ...' : 'СОХРАНИТЬ ПРОГРЕСС'}
        </button>
      </div>

      <div className="panel panel-right">
        <div className="result-header">
          <h2>Редактор</h2>
          {scheduleData && <button className="copy-btn" onClick={handleCopyToClipboard}>{copyStatus}</button>}
        </div>
        <div className="result-area">
          {!scheduleData ? <div className="placeholder-text">Выберите шаблон...</div> : (
            <div className="result-container">
              {/* FIXED COLUMN: G12 */}
              <div className="result-column">
                <div className="sector-block">
                  <div className="sector-title">
                    <span>Сектор Г12</span>
                    <button className="swap-workstations-btn" onClick={() => handleSwapWorkstations('Г12')}>
                      ⇅ Позиции
                    </button>
                  </div>
                  {renderSlotsGroup('Г12', 'РУ')}
                  {renderSlotsGroup('Г12', 'ПК')}
                </div>
              </div>

              {/* FIXED UI: SWAP SECTORS BUTTON */}
              <div className="swap-sectors-wrapper">
                <button className="swap-btn" title="Перекинуть данные между секторами" onClick={handleSwapSectors}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M7 16V4M7 4L3 8M7 4L11 8M17 8v12M17 20l4-4M17 20l-4-4" /></svg>
                </button>
              </div>

              {/* FIXED COLUMN: G345 */}
              <div className="result-column">
                <div className="sector-block">
                  <div className="sector-title">
                    <span>Сектор Г345</span>
                    <button className="swap-workstations-btn" onClick={() => handleSwapWorkstations('Г345')}>
                      ⇅ Позиции
                    </button>
                  </div>
                  {renderSlotsGroup('Г345', 'РУ')}
                  {renderSlotsGroup('Г345', 'ПК')}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="digital-signature">Vostok / Offline Engine</div>
    </div>
  );
}

export default App;
