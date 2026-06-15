const API_URL = 'https://cnpp.ru/api.php';

export interface ResultSummary {
  id: string;
  created_at: string;
  test_ids: string[];
  severities: Record<string, string>;
}

export interface SaveResultsPayload {
  test_ids: string[];
  scores: Record<string, { score: number; interpretation: string }>;
  ai_interpretation?: string;
  severities: Record<string, string>;
}

export async function saveResults(payload: SaveResultsPayload): Promise<string> {
  const res = await fetch(`${API_URL}?action=save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Ошибка сохранения');
  const data = await res.json();
  if (!data.id) throw new Error('Нет ID в ответе');
  return data.id;
}

export async function loadResults(id: string): Promise<SaveResultsPayload | null> {
  const res = await fetch(`${API_URL}?action=get&id=${encodeURIComponent(id)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Ошибка загрузки');
  return res.json();
}

export async function listResults(): Promise<ResultSummary[]> {
  const res = await fetch(`${API_URL}?action=list`);
  if (!res.ok) throw new Error('Ошибка загрузки списка');
  return res.json();
}
