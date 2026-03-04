/**
 * Валидатор расписания Vostok
 */

const timeToMinutes = (timeStr) => {
    if (!timeStr || typeof timeStr !== 'string') return null;
    const parts = timeStr.split(':');
    if (parts.length !== 2) return null;
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    if (isNaN(hours) || isNaN(minutes)) return null;
    return hours * 60 + minutes;
};

const isOverlapping = (s1, e1, s2, e2) => {
    // Интервалы пересекаются, если начало одного раньше конца другого 
    // И начало второго раньше конца первого
    return s1 < e2 && s2 < e1;
};

/**
 * Проверяет правила расписания
 * @param {Array} slots - Массив всех слотов
 * @param {Object} assignments - Глобальные назначения { "[Чел 1]": "Имя" }
 */
export const checkRules = (slots, assignments) => {
    const results = {};
    if (!slots || !Array.isArray(slots) || !assignments) return results;

    // Группируем слоты по конкретным сотрудникам (по их реальным именам)
    const employeeMap = {};

    slots.forEach(slot => {
        // Приоритет: ручное имя (overrideName) > глобальное назначение (assignments)
        const name = slot.overrideName || assignments[slot.assignedTo];
        if (!name) return; // Слот не назначенм пустые слоты

        const startMin = timeToMinutes(slot.timeStart);
        const endMin = timeToMinutes(slot.timeEnd);

        if (startMin === null || endMin === null) return;

        // Обработка ночных смен (например, 23:00 - 01:00)
        let actualEnd = endMin;
        if (actualEnd < startMin) {
            actualEnd += 24 * 60; // Добавляем сутки
        }

        if (!employeeMap[name]) employeeMap[name] = [];

        employeeMap[name].push({
            id: slot.id,
            start: startMin,
            end: actualEnd,
            duration: actualEnd - startMin,
            marker: slot.assignedTo
        });
    });

    // Проверяем каждого сотрудника
    Object.keys(employeeMap).forEach(name => {
        const userSlots = employeeMap[name];

        // Сортируем по времени начала
        userSlots.sort((a, b) => a.start - b.start);

        for (let i = 0; i < userSlots.length; i++) {
            const current = userSlots[i];

            // 1. Правило: Смена > 120 минут без перерыва
            if (current.duration > 120) {
                results[current.id] = {
                    type: 'warning',
                    message: `Смена длится ${current.duration} мин. Рекомендуется делать перерыв каждые 2 часа.`
                };
            }

            // 2. Правило: Пересечение с другими сменами этого же человека
            for (let j = 0; j < userSlots.length; j++) {
                if (i === j) continue;
                const other = userSlots[j];

                if (isOverlapping(current.start, current.end, other.start, other.end)) {
                    // Критическая ошибка - наложение
                    results[current.id] = {
                        type: 'error',
                        message: `Конфликт! В это время сотрудник уже назначен на другую позицию (${other.start === current.start ? 'полное наложение' : 'пересечение'}).`
                    };
                }
            }
        }
    });

    return results;
};
