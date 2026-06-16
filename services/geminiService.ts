import { TestResult, TestDefinition } from '../types';

export type DiagnosticDepth = 'express' | 'standard' | 'deep';

const callGemini = async (model: string, contents: string, config?: Record<string, any>): Promise<string> => {
  const res = await fetch('/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, contents, config }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data.text || '';
};

const parseAIJson = (text: string) => {
  try {
    const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleaned);
  } catch (e) {
    console.error("Failed to parse AI JSON:", text);
    return null;
  }
};

export async function getSmartRecommendations(
  symptoms: string,
  depth: DiagnosticDepth,
  availableTests: TestDefinition[]
): Promise<string[]> {
  const testList = availableTests.map(t => `${t.id} (${t.name} - ${t.category})`).join(', ');
  const systemInstruction = `Ты - медицинский координатор. Твоя задача - выбрать ID тестов из списка: [${testList}].
  Критерии выбора зависят от режима:
  1. express (Экспресс): Максимум 2-3 теста. Только самые важные скрининги (обычно phq9, gad7).
  2. standard (Стандарт): Максимум 4-5 тестов. Баланс скринингов и специфичных шкал.
  3. deep (Глубокое): До 8 тестов. Глубокие опросники (например, bdi2 вместо phq9).
  Режим: "${depth}".
  Верни JSON массив строк (ID).`;

  try {
    const text = await callGemini(
      'gemini-2.5-flash',
      `Жалобы пациента: "${symptoms}". Подобрать подходящие тесты.`,
      { systemInstruction, responseMimeType: 'application/json' }
    );
    return parseAIJson(text) || (depth === 'express' ? ['phq9', 'gad7'] : ['phq9', 'gad7', 'dass21']);
  } catch (error: any) {
    console.error("Gemini Error:", error);
    if (error?.message?.includes("Requested entity was not found")) throw new Error("AI_KEY_INVALID");
    return depth === 'express' ? ['phq9', 'gad7'] : ['phq9', 'gad7', 'dass21'];
  }
}

export async function getSelfKnowledgeRecommendations(
  goal: string,
  availableTests: TestDefinition[]
): Promise<string[]> {
  const relevantTests = availableTests.filter(t =>
    ['personality', 'self_knowledge', 'wellbeing', 'burnout'].includes(t.category)
  );
  const testList = relevantTests.map(t => `${t.id} (${t.name}: ${t.description})`).join(', ');
  const systemInstruction = `Ты - эксперт по психодиагностике личности.
  Твоя задача - подобрать набор методик из списка: [${testList}] для пользователя.
  Запрос пользователя: "${goal}".
  Логика:
  1. Если запрос про карьеру/работу -> MBI, GSES, 16PF.
  2. Если про отношения -> 16PF, EPQ-R, OSO.
  3. Если про самооценку -> CSES, RSES, OSO, Self-Concept Gap.
  4. Если про характер в целом -> BFI-10, EPQ-R.
  Верни JSON массив строк (ID). Выбери от 2 до 5 наиболее подходящих тестов.`;

  try {
    const text = await callGemini(
      'gemini-2.5-flash',
      `Запрос пользователя: "${goal}". Подобрать батарею тестов.`,
      { systemInstruction, responseMimeType: 'application/json' }
    );
    return parseAIJson(text) || ['bfi10', 'rses'];
  } catch (error: any) {
    console.error("Gemini Self-Knowledge Error:", error);
    if (error?.message?.includes("Requested entity was not found")) throw new Error("AI_KEY_INVALID");
    return relevantTests.slice(0, 3).map(t => t.id);
  }
}

export async function getSelfKnowledgeInterpretation(results: TestResult[], userGoal: string): Promise<string> {
  const summary = results.map(r => {
    let text = `Тест "${r.testName}": ${r.interpretation} (Балл: ${r.score}).`;
    if (r.subscales?.length) {
      text += ` Детализация: [${r.subscales.map(s => `${s.name}: ${s.score}/${s.maxScore}`).join('; ')}]`;
    }
    return text;
  }).join('\n');

  try {
    return await callGemini('gemini-2.5-pro', `
Роль: Эксперт по психологии личности и карьерному коучингу.
Задача: Дать глубокую, персонализированную интерпретацию личности на основе тестов.

Входные данные:
1. Запрос пользователя (цель): "${userGoal || 'Общее самопознание'}"
2. Результаты тестов:
${summary}

Структура ответа (Markdown):
### Психологический портрет
### Сильные стороны и Ресурсы
### Зоны роста и Риски
### Ответ на запрос
### Рекомендации

Тон: Уважительный, глубокий, аналитический. Используй "Вы".
    `, { temperature: 0.7, maxOutputTokens: 5000 });
  } catch (error: any) {
    console.error("AI Personality Error", error);
    if (error?.message?.includes("Requested entity was not found")) throw new Error("AI_KEY_INVALID");
    return "### Ошибка\nНе удалось составить психологический портрет.";
  }
}

export async function getAggregateInterpretation(results: TestResult[], userComplaints: string = ''): Promise<string> {
  if (results.length === 0) return "Нет данных для интерпретации.";

  const summary = results.map(r => {
    let text = `${r.testName}: ${r.severity} (${r.interpretation}). Баллы: ${r.score}.`;
    if (r.subscales?.length) {
      text += ` Подшкалы: [${r.subscales.map(s => `${s.name}: ${s.score}/${s.maxScore}`).join(', ')}]`;
    }
    return text;
  }).join('\n');

  try {
    return await callGemini('gemini-2.5-pro', `
Ты — опытный психолог-аналитик. Ты НЕ представляешь какую-либо конкретную клинику.
Задача: Дать развёрнутое, персонализированное заключение на основе жалоб и результатов тестов.

Входные данные:
1. Жалобы/Запрос человека: "${userComplaints || 'Не указаны'}"
2. Результаты тестирования:
${summary}

Структура ответа (Markdown):
### Что говорят результаты
### Как это связано с вашим запросом
### Зоны для работы
### Рекомендации

Тон: Эмпатичный, тёплый, конкретный. Обращайся на "вы".
    `, { temperature: 0.6, maxOutputTokens: 4000 });
  } catch (error: any) {
    console.error("AI Generation Error", error);
    if (error?.message?.includes("Requested entity was not found")) throw new Error("AI_KEY_INVALID");
    return `### Ошибка анализа\nНе удалось получить ответ от ИИ. Ориентируйтесь на графики выше.\n\n_Детали: ${error?.message || String(error)}_`;
  }
}
