import { UserAnswers } from '../types';

const API_URL = 'https://cnpp.ru/api.php';
// Не настоящая аутентификация — см. комментарий в api.php. Поднимает планку доступа к сырым
// ответам пациентов с "открытый API" до "нужен секрет из бандла".
const ADMIN_SECRET = 'DialecticaAdmin2026!';

export interface SaveResultsPayload {
  test_ids: string[];
  scores: Record<string, { score: number; interpretation: string }>;
  answers?: UserAnswers;
  ai_interpretation?: string;
  severities: Record<string, string>;
  complaints?: string;
  self_goal?: string;
  referrer?: string;
  entry_point?: string;
}

export interface ResultSummary {
  id: string;
  created_at: string;
  test_ids: string[];
  severities: Record<string, string>;
  complaints?: string;
  self_goal?: string;
  referrer?: string;
  entry_point?: string;
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

// Публичная загрузка (для ?r=id) — намеренно НИКОГДА не содержит сырых ответов на вопросы.
export async function loadResults(id: string): Promise<SaveResultsPayload | null> {
  const res = await fetch(`${API_URL}?action=get&id=${encodeURIComponent(id)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Ошибка загрузки');
  return res.json();
}

// Загрузка С сырыми ответами — только для админ-панели.
export async function loadFullResult(id: string): Promise<(SaveResultsPayload & { id: string; created_at: string }) | null> {
  const res = await fetch(`${API_URL}?action=get_full&id=${encodeURIComponent(id)}`, {
    headers: { 'X-Admin-Secret': ADMIN_SECRET },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Ошибка загрузки');
  return res.json();
}

export async function listResults(): Promise<ResultSummary[]> {
  const res = await fetch(`${API_URL}?action=list`, {
    headers: { 'X-Admin-Secret': ADMIN_SECRET },
  });
  if (!res.ok) throw new Error('Ошибка загрузки списка');
  return res.json();
}
