<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$host = 'localhost';
$db   = 'u0667057_clinic_tests';
$user = 'u0667057_Staroverovs92';
$pass = 'Kingstar3212';

try {
    $pdo = new PDO("mysql:host=$host;dbname=$db;charset=utf8mb4", $user, $pass);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'DB connection failed']);
    exit();
}

$action = $_GET['action'] ?? '';

// Сохранить результаты, вернуть короткий ID
if ($action === 'save' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true);
    if (!$data || empty($data['test_ids']) || empty($data['scores'])) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid data']);
        exit();
    }

    $id = substr(str_shuffle('abcdefghijklmnopqrstuvwxyz0123456789'), 0, 8);

    $stmt = $pdo->prepare(
        'INSERT INTO results (id, test_ids, scores, ai_interpretation, severities)
         VALUES (:id, :test_ids, :scores, :ai, :severities)'
    );
    $stmt->execute([
        ':id'         => $id,
        ':test_ids'   => json_encode($data['test_ids']),
        ':scores'     => json_encode($data['scores']),
        ':ai'         => $data['ai_interpretation'] ?? null,
        ':severities' => json_encode($data['severities'] ?? []),
    ]);

    echo json_encode(['id' => $id]);
    exit();
}

// Получить результаты по ID
if ($action === 'get' && isset($_GET['id'])) {
    $stmt = $pdo->prepare('SELECT * FROM results WHERE id = :id');
    $stmt->execute([':id' => $_GET['id']]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$row) {
        http_response_code(404);
        echo json_encode(['error' => 'Not found']);
        exit();
    }

    $row['test_ids']   = json_decode($row['test_ids']);
    $row['scores']     = json_decode($row['scores']);
    $row['severities'] = json_decode($row['severities']);

    echo json_encode($row);
    exit();
}

http_response_code(400);
echo json_encode(['error' => 'Unknown action']);
