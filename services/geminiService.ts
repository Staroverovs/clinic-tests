
import { GoogleGenAI, Type } from "@google/genai";
import { TestResult, TestDefinition } from '../types';

// Helper to safely get the API key
const getApiKey = () => {
  try {
    const key = process.env.API_KEY || process.env.GEMINI_API_KEY;
    if (key && key !== 'undefined' && key !== 'null' && key !== '') return key;
    return undefined;
  } catch (e) {
    return undefined;
  }
};

// Helper to clean JSON response from AI
const parseAIJson = (text: string) => {
  try {
    const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleaned);
  } catch (e) {
    console.error("Failed to parse AI JSON:", text);
    return null;
  }
};

export type DiagnosticDepth = 'express' | 'standard' | 'deep';

export async function getSmartRecommendations(
  symptoms: string, 
  depth: DiagnosticDepth,
  availableTests: TestDefinition[]
): Promise<string[]> {
  const apiKey = getApiKey();
  // Fallback defaults if no API key
  if (!apiKey) {
    console.warn("No API Key available for recommendations");
    if (depth === 'express') return ['phq9', 'gad7'];
    return ['phq9', 'gad7', 'dass21'];
  }

  const ai = new GoogleGenAI({ apiKey });
  
  // Compact list of tests to save tokens
  const testList = availableTests.map(t => `${t.id} (${t.name} - ${t.category})`).join(', ');

  const systemInstruction = `Ты - медицинский координатор. Твоя задача - выбрать ID тестов из списка: [${testList}].
  Критерии выбора зависят от режима:
  1. express (Экспресс): Максимум 2-3 теста. Только самые важные скрининги (обычно phq9, gad7).
  2. standard (Стандарт): Максимум 4-5 тестов. Баланс скринингов и специфичных шкал.
  3. deep (Глубокое): До 8 тестов. Глубокие опросники (например, bdi2 вместо phq9).
  
  Режим: "${depth}".
  Верни JSON массив строк (ID).`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Жалобы пациента: "${symptoms}". Подобрать подходящие тесты.`,
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.STRING,
            description: 'Test ID'
          }
        }
      }
    });
    return parseAIJson(response.text || '[]') || ['phq9', 'gad7'];
  } catch (error: any) {
    console.error("Gemini Error:", error);
    if (error?.message?.includes("Requested entity was not found")) {
      throw new Error("AI_KEY_INVALID");
    }
    return ['phq9', 'gad7'];
  }
}

export async function getSelfKnowledgeRecommendations(
  goal: string,
  availableTests: TestDefinition[]
): Promise<string[]> {
  const apiKey = getApiKey();
  // Filter only relevant tests before sending to AI to avoid hallucinations
  const relevantTests = availableTests.filter(t => 
    ['personality', 'self_knowledge', 'wellbeing', 'burnout'].includes(t.category)
  );
  
  if (!apiKey) return relevantTests.slice(0, 3).map(t => t.id); // Fallback

  const ai = new GoogleGenAI({ apiKey });
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
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Запрос пользователя: "${goal}". Подобрать батарею тестов.`,
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        }
      }
    });
    return parseAIJson(response.text || '[]') || ['bfi10', 'rses'];
  } catch (error: any) {
    console.error("Gemini Self-Knowledge Error:", error);
    if (error?.message?.includes("Requested entity was not found")) {
      throw new Error("AI_KEY_INVALID");
    }
    return ['bfi10', 'rses'];
  }
}

export async function getSelfKnowledgeInterpretation(results: TestResult[], userGoal: string): Promise<string> {
    const apiKey = getApiKey();
    if (!apiKey) return "### Результаты готовы\nAI-анализ недоступен.";

    // Richer summary
    const summary = results.map(r => {
        let text = `Тест "${r.testName}": ${r.interpretation} (Балл: ${r.score}).`;
        if (r.subscales && r.subscales.length > 0) {
            const subInfo = r.subscales.map(s => `${s.name}: ${s.score}/${s.maxScore}`).join('; ');
            text += ` Детализация: [${subInfo}]`;
        }
        return text;
    }).join('\n');

    const ai = new GoogleGenAI({ apiKey });
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-pro',
            contents: `
            Роль: Эксперт по психологии личности и карьерному коучингу.
            Задача: Дать глубокую, персонализированную интерпретацию личности на основе тестов. Это НЕ медицинский диагноз, а психологический портрет.

            Входные данные:
            1. Запрос пользователя (цель): "${userGoal || 'Общее самопознание'}"
            2. Результаты тестов:
            ${summary}

            Структура ответа (Markdown):
            ### Психологический портрет
            (Синтезируй данные всех тестов. Опиши характер человека, как сочетаются его черты. Например: "Высокая добросовестность сочетается с тревожностью, что дает перфекционизм...").

            ### Сильные стороны и Ресурсы
            (Что является "суперсилой" этого человека? На что он может опереться в работе и жизни?).

            ### Зоны роста и Риски
            (Теневые стороны характера. Что может мешать? Где возможен срыв?).

            ### Ответ на запрос
            (Конкретно ответь на запрос "${userGoal}" исходя из профиля личности. Если запрос про карьеру — какие роли подходят. Если про отношения — какой стиль привязанности и общения).

            ### Рекомендации
            (Книги, практики, стиль жизни, направления психотерапии, если нужно).

            Тон: Уважительный, глубокий, аналитический, вдохновляющий. Используй "Вы".
            `,
            config: {
                temperature: 0.7,
                maxOutputTokens: 5000,
            }
        });
        return response.text || "Не удалось сгенерировать портрет.";
    } catch (error: any) {
        console.error("AI Personality Error", error);
        if (error?.message?.includes("Requested entity was not found")) {
          throw new Error("AI_KEY_INVALID");
        }
        return "### Ошибка\nНе удалось составить психологический портрет.";
    }
}

export async function getAggregateInterpretation(results: TestResult[], userComplaints: string = ''): Promise<string> {
  const apiKey = getApiKey();
  if (!apiKey) return "### Результаты готовы\nСистема ИИ-интерпретации недоступна (отсутствует API ключ).";

  if (results.length === 0) return "Нет данных для интерпретации.";
  
  // Create a richer summary including subscales if available
  const summary = results.map(r => {
    let text = `${r.testName}: ${r.severity} (${r.interpretation}). Баллы: ${r.score}.`;
    if (r.subscales && r.subscales.length > 0) {
      const subInfo = r.subscales.map(s => `${s.name}: ${s.score}/${s.maxScore}`).join(', ');
      text += ` Подшкалы: [${subInfo}]`;
    }
    return text;
  }).join('\n');
  
  const ai = new GoogleGenAI({ apiKey });
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-pro',
      contents: `
      Ты — опытный психолог-аналитик. Ты НЕ представляешь какую-либо конкретную клинику.
      Задача: Дать развёрнутое, персонализированное заключение на основе жалоб и результатов тестов.

      Входные данные:
      1. Жалобы/Запрос человека: "${userComplaints || 'Не указаны'}"
      2. Результаты тестирования:
      ${summary}

      Структура ответа (Markdown):
      ### Что говорят результаты
      (Подробно объясни каждый результат теста простым языком. Свяжи цифры с конкретными жалобами человека — что подтверждается, что неожиданно, какие паттерны прослеживаются. Минимум 3-4 предложения).

      ### Как это связано с вашим запросом
      (Конкретно и детально ответь на жалобы/запрос человека через призму результатов. Объясни механизм: почему именно так проявляются симптомы, что за ними стоит).

      ### Зоны для работы
      (4-5 конкретных зон с кратким объяснением каждой — что это, почему важно в данном случае).

      ### Рекомендации
      (Практические шаги: что можно начать делать уже сейчас, и почему важна работа со специалистом).

      Тон: Эмпатичный, тёплый, конкретный. Обращайся на "вы". Без воды и шаблонных фраз.
      `,
      config: {
        temperature: 0.6,
        maxOutputTokens: 4000, 
      }
    });
    return response.text || "Не удалось сгенерировать интерпретацию.";
  } catch (error: any) {
    console.error("AI Generation Error", error);
    if (error?.message?.includes("Requested entity was not found")) {
      throw new Error("AI_KEY_INVALID");
    }
    return `### Ошибка анализа\nНе удалось получить ответ от ИИ. Ориентируйтесь на графики выше.\n\n_Детали: ${error?.message || String(error)}_`;
  }
}
