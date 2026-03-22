import React, { useState, useEffect, useRef, useMemo } from 'react';
import { TESTS, CATEGORY_LABELS, DISEASES } from './constants';
import { TestDefinition, UserAnswers, TestResult, Disease } from './types';
import { getSmartRecommendations, getSelfKnowledgeRecommendations, getSelfKnowledgeInterpretation, getAggregateInterpretation, DiagnosticDepth } from './services/geminiService';
import { encodeBattery, decodeBattery, encodeResults, decodeResults } from './services/shareService';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

type AppStep = 'welcome' | 'selection' | 'self_knowledge_selection' | 'testing' | 'results' | 'diseases' | 'faq';

const FAQ_DATA = [
  {
    question: "Как работает ИИ-анализ?",
    answer: "Наш ИИ анализирует ваши жалобы и подбирает наиболее подходящие клинические тесты. После завершения тестирования он синтезирует результаты всех шкал, чтобы дать целостную картину вашего состояния и персонализированные рекомендации."
  },
  {
    question: "Являются ли результаты диагнозом?",
    answer: "Нет. Результаты тестирования носят исключительно информационный характер. Окончательный диагноз может поставить только квалифицированный врач-психиатр или психотерапевт на очной консультации."
  },
  {
    question: "Как долго хранятся мои данные?",
    answer: "Мы не храним ваши персональные данные на сервере. Все результаты тестов кодируются в ссылке, которую вы можете сохранить или отправить врачу. Как только вы закрываете вкладку, данные сессии удаляются."
  },
  {
    question: "Что такое 'Лаборатория Я'?",
    answer: "Это раздел с психологическими тестами, направленными на самопознание: изучение черт личности, темперамента, уровня выгорания и ресурсов. Они помогают лучше понять себя вне клинического контекста."
  },
  {
    question: "Как отправить результаты врачу?",
    answer: "На странице результатов нажмите кнопку 'Ссылка на результат'. Ссылка будет скопирована в буфер обмена. Вы можете отправить её врачу через любой мессенджер или почту."
  },
  {
    question: "Безопасно ли это?",
    answer: "Да, мы используем современные протоколы шифрования. Ваша анонимность — наш приоритет. Мы не запрашиваем ваше имя, телефон или другие идентифицирующие данные."
  }
];

interface TestGridCardProps {
  test: TestDefinition;
  onClick: () => void;
  isSelected?: boolean;
}

const TestGridCard: React.FC<TestGridCardProps> = ({ test, onClick, isSelected = false }) => (
    <div 
      onClick={onClick}
      className={`p-5 sm:p-6 rounded-2xl border cursor-pointer flex flex-col h-40 sm:h-44 relative group select-none transition-all duration-300 ease-out overflow-hidden ${
          isSelected 
          ? 'border-[#4A6D7C] bg-[#4A6D7C]/10 shadow-[0_0_20px_rgba(74,109,124,0.2)] backdrop-blur-xl scale-[1.02]' 
          : 'border-white/40 bg-white/30 hover:bg-white/60 hover:border-white/80 hover:shadow-[0_10px_40px_-10px_rgba(74,109,124,0.15)] backdrop-blur-md hover:-translate-y-1'
      }`}
      >
      {/* Decorative gradient blob on hover */}
      <div className={`absolute -right-10 -top-10 w-32 h-32 bg-gradient-to-br from-[#4A6D7C]/10 to-transparent rounded-full blur-2xl transition-opacity duration-500 ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}></div>
      
      <div className="flex justify-between items-start mb-3 relative z-10">
          <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg border backdrop-blur-sm transition-colors ${
              isSelected 
              ? 'bg-[#4A6D7C] text-white border-[#4A6D7C]' 
              : 'bg-white/50 text-slate-500 border-white/50 group-hover:bg-white group-hover:border-white'
          }`}>
              {CATEGORY_LABELS[test.category] || 'Другое'}
          </span>
          <div className={`w-6 h-6 rounded-full border flex items-center justify-center transition-all duration-300 ${
              isSelected ? 'bg-[#4A6D7C] border-[#4A6D7C] text-white scale-110' : 'border-slate-300 text-transparent scale-90 group-hover:scale-100 group-hover:border-[#4A6D7C]/50'
          }`}>
              <i className="fas fa-check text-[10px]"></i>
          </div>
      </div>
      <div className="relative z-10 mt-auto">
          <h3 className={`font-bold text-sm sm:text-base mb-1 transition-colors leading-tight ${isSelected ? 'text-[#2E4857]' : 'text-slate-800 group-hover:text-[#4A6D7C]'}`}>{test.name}</h3>
          <p className="text-[10px] sm:text-xs text-slate-500 line-clamp-2 leading-relaxed opacity-80 group-hover:opacity-100 transition-opacity">{test.description}</p>
      </div>
  </div>
);

export default function App() {
  const [step, setStep] = useState<AppStep>('welcome');
  const [selectedTests, setSelectedTests] = useState<string[]>([]);
  const [currentTestIndex, setCurrentTestIndex] = useState(0);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<UserAnswers>({});
  
  // Clinical complaints
  const [complaints, setComplaints] = useState('');
  // Self-knowledge goal
  const [selfGoal, setSelfGoal] = useState('');

  const [depth, setDepth] = useState<DiagnosticDepth>('standard');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('Анализ данных...'); 
  const [results, setResults] = useState<TestResult[]>([]);
  const [aiInterpretation, setAiInterpretation] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [pressedAnswerKey, setPressedAnswerKey] = useState<string | null>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [diseaseSearch, setDiseaseSearch] = useState('');
  
  // AI Key Management
  const [hasAiKey, setHasAiKey] = useState(false); // Default to false, check on mount
  const [isCheckingKey, setIsCheckingKey] = useState(true);

  // New state for Shared Mode (Read Only)
  const [isSharedView, setIsSharedView] = useState(false);
  const [sharedMessage, setSharedMessage] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const currentTestId = selectedTests[currentTestIndex];
  const currentTest = currentTestId ? TESTS.find(t => t.id === currentTestId) : null;
  const currentQuestion = currentTest?.questions[currentQuestionIndex];

  // AI Key Check
  useEffect(() => {
    const checkKey = async () => {
      let keyFound = false;
      
      // 1. Check aistudio API
      // @ts-ignore
      if (window.aistudio && typeof window.aistudio.hasSelectedApiKey === 'function') {
        // @ts-ignore
        keyFound = await window.aistudio.hasSelectedApiKey();
      }
      
      // 2. Check baked-in via process.env
      if (!keyFound) {
        const bakedKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
        keyFound = !!(bakedKey && bakedKey !== 'undefined' && bakedKey !== 'null');
      }
      
      setHasAiKey(keyFound);
      setIsCheckingKey(false);
    };
    checkKey();
  }, []);

  const handleOpenKeyDialog = async () => {
    // @ts-ignore
    if (window.aistudio && typeof window.aistudio.openSelectKey === 'function') {
      // @ts-ignore
      await window.aistudio.openSelectKey();
      setHasAiKey(true); // Assume success as per instructions
    }
  };

  // Logic to communicate height to parent iframe to avoid double scrollbars
  // Enhanced with MutationObserver to catch all DOM changes
  useEffect(() => {
    const sendHeight = () => {
      // Get the full height of the document, ensuring we catch overflow
      const height = Math.max(
          document.body.scrollHeight, 
          document.documentElement.scrollHeight,
          document.body.offsetHeight, 
          document.documentElement.offsetHeight,
          document.body.clientHeight, 
          document.documentElement.clientHeight,
          containerRef.current ? containerRef.current.offsetHeight + 100 : 0
      );
      // Send message to parent
      window.parent.postMessage({ type: 'setHeight', height: height + 20 }, '*'); 
    };

    // Observer for DOM changes (attributes, child list, subtree)
    const observer = new MutationObserver((mutations) => {
        sendHeight();
    });
    
    observer.observe(document.body, {
        attributes: true,
        childList: true,
        subtree: true
    });
    
    // Also trigger on standard events
    window.addEventListener('load', sendHeight);
    window.addEventListener('resize', sendHeight);
    
    // Initial calls
    sendHeight();
    const interval = setInterval(sendHeight, 1000); // Heartbeat for safety

    return () => {
      observer.disconnect();
      window.removeEventListener('load', sendHeight);
      window.removeEventListener('resize', sendHeight);
      clearInterval(interval);
    };
  }, [step]); // Re-bind if step changes significantly, though observer catches most

  // URL Parsing Effect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const batteryHash = params.get('tests');
    const reportHash = params.get('report');

    if (reportHash) {
        // Mode: View Result (Therapist viewing client result)
        setIsLoading(true);
        setLoadingText("Загрузка результатов пациента...");
        setTimeout(() => {
            const data = decodeResults(reportHash);
            if (data) {
                // Ensure we filter out any test IDs that don't exist in our current version
                const validTestIds = data.testIds.filter(id => TESTS.some(t => t.id === id));
                
                setSelectedTests(validTestIds);
                setAnswers(data.answers);
                // Trigger calculation immediately
                const calculatedResults = calculateResultsPure(validTestIds, data.answers);
                setResults(calculatedResults);
                // Decode AI interpretation if exists
                if (data.aiInterpretation) {
                    setAiInterpretation(data.aiInterpretation);
                }
                setIsSharedView(true);
                setStep('results');
                setSharedMessage("Режим просмотра результатов (Только чтение)");
            } else {
                alert("Ошибка ссылки: Некорректные данные.");
            }
            setIsLoading(false);
        }, 500);
    } else if (batteryHash) {
        // Mode: Battery Assigned (Client viewing therapist assignment)
        const ids = decodeBattery(batteryHash);
        if (ids.length > 0) {
            // Filter valid IDs
            const validIds = ids.filter(id => TESTS.some(t => t.id === id));
            setSelectedTests(validIds);
            setStep('selection'); // Or directly to testing? Better to selection to let them confirm.
            setSharedMessage("Вам назначен список тестов специалистом.");
        }
    }
  }, []);

  const severityMap: Record<string, { label: string, color: string, lifeImpact: string }> = {
    normal: { 
      label: 'В пределах нормы', 
      color: 'bg-emerald-50/80 text-emerald-700 border-emerald-100/50',
      lifeImpact: 'Ваше состояние стабильно и является надежным ресурсом для достижения жизненных целей.'
    },
    mild: { 
      label: 'Лёгкая степень', 
      color: 'bg-sky-50/80 text-sky-700 border-sky-100/50',
      lifeImpact: 'Это состояние может незаметно снижать продуктивность, повышать утомляемость и лишать удовольствия от привычных мелочей.'
    },
    moderate: { 
      label: 'Средняя степень', 
      color: 'bg-amber-50/80 text-amber-700 border-amber-100/50',
      lifeImpact: 'Вероятно, это уже сказывается на качестве работы, отношениях с близкими или сне. Вы тратите слишком много сил на борьбу с собой.'
    },
    severe: { 
      label: 'Выраженная степень', 
      color: 'bg-rose-50/80 text-rose-700 border-rose-100/50',
      lifeImpact: 'Высокий риск эмоционального истощения. Такое состояние может блокировать развитие и мешать жить полноценной жизнью.'
    },
    critical: { 
      label: 'Критический уровень', 
      color: 'bg-red-50/80 text-red-800 border-red-100/50',
      lifeImpact: 'Это сигнал SOS вашей психики. Не стоит терпеть эту боль и справляться в одиночку — профессиональная помощь необходима.'
    },
  };

  const scrollToTop = () => {
    // Scroll to the top of the app container instead of window to stay in context
    if (containerRef.current) {
        containerRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const resetApp = () => {
      setStep('welcome');
      setSelectedTests([]);
      setAnswers({});
      setResults([]);
      setAiInterpretation('');
      setComplaints('');
      setSelfGoal('');
      setDepth('standard');
      setCurrentTestIndex(0);
      setCurrentQuestionIndex(0);
      setIsTransitioning(false);
      setIsSharedView(false);
      setSharedMessage(null);
      // Clear URL params without reload
      window.history.pushState({}, '', window.location.pathname);
  };

  const handleGoHome = () => {
    if (step === 'testing') {
        if (!window.confirm("Прогресс текущего тестирования будет утерян. Выйти в главное меню?")) {
            return;
        }
    }
    resetApp();
    scrollToTop();
  };

  const handleShareBattery = () => {
    if (selectedTests.length === 0) return;
    const hash = encodeBattery(selectedTests);
    const url = `${window.location.origin}${window.location.pathname}?tests=${hash}`;
    navigator.clipboard.writeText(url).then(() => {
        alert("Ссылка на набор тестов скопирована! Отправьте её клиенту.");
    });
  };

  const handleShareResults = () => {
     if (results.length === 0) return;
     // Include AI interpretation in the link if available
     const hash = encodeResults(answers, selectedTests, aiInterpretation);
     const url = `${window.location.origin}${window.location.pathname}?report=${hash}`;
     
     // Check URL length safety
     if (url.length > 2000) {
         alert("Внимание: Ссылка получилась слишком длинной и может не открыться в некоторых мессенджерах. Рекомендуется использовать PDF.");
     }
     
     navigator.clipboard.writeText(url).then(() => {
        alert("Ссылка на результат скопирована! Отправьте её своему специалисту.");
     });
  };

  const handleDownloadPdf = async () => {
    setIsGeneratingPdf(true);

    // @ts-ignore
    if (typeof window.html2pdf === 'undefined') {
      alert("Модуль PDF ещё загружается. Попробуйте через секунду.");
      setIsGeneratingPdf(false);
      return;
    }

    const date = new Date().toLocaleDateString('ru-RU');

    const resultsHtml = results.map(r => {
      const subscalesHtml = r.subscales && r.subscales.length > 0
        ? `<div style="margin-top:6px;padding-left:12px;border-left:3px solid #4A6D7C;">
            ${r.subscales.map(s => `<div style="font-size:12px;color:#475569;">${s.name}: <b>${s.score}</b> / ${s.maxScore}</div>`).join('')}
           </div>`
        : '';
      return `
        <div style="margin-bottom:20px;padding:16px;border:1px solid #e2e8f0;border-radius:8px;page-break-inside:avoid;">
          <div style="font-size:15px;font-weight:700;color:#1e293b;margin-bottom:4px;">${r.testName}</div>
          <div style="font-size:13px;color:#475569;margin-bottom:4px;">${r.interpretation}</div>
          <div style="font-size:12px;color:#64748b;">Балл: <b>${r.score}</b> | Уровень: <b>${r.severity}</b></div>
          ${subscalesHtml}
        </div>`;
    }).join('');

    const aiHtml = aiInterpretation
      ? `<div style="margin-top:32px;padding-top:24px;border-top:2px solid #4A6D7C;">
          <h2 style="font-size:18px;font-weight:700;color:#1e293b;margin-bottom:16px;">AI-анализ результатов</h2>
          <div style="font-size:13px;color:#334155;line-height:1.7;white-space:pre-wrap;">${aiInterpretation.replace(/###\s*/g, '\n').replace(/\*\*/g, '')}</div>
         </div>`
      : '';

    const html = `
      <div style="font-family:Arial,sans-serif;color:#1e293b;padding:32px;max-width:700px;margin:0 auto;">
        <div style="text-align:center;margin-bottom:32px;padding-bottom:20px;border-bottom:2px solid #4A6D7C;">
          <div style="font-size:22px;font-weight:800;color:#4A6D7C;">Клиника Диалектика</div>
          <div style="font-size:14px;color:#64748b;margin-top:4px;">Результаты психологического тестирования</div>
          <div style="font-size:12px;color:#94a3b8;margin-top:2px;">${date}</div>
        </div>
        <h2 style="font-size:18px;font-weight:700;color:#1e293b;margin-bottom:16px;">Результаты тестов</h2>
        ${resultsHtml}
        ${aiHtml}
        <div style="margin-top:32px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8;text-align:center;">
          Данный отчёт является предварительным и не заменяет консультацию специалиста.
        </div>
      </div>`;

    const container = document.createElement('div');
    container.innerHTML = html;
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    document.body.appendChild(container);

    const opt = {
      margin: [10, 10],
      filename: `Dialektika_Report_${new Date().toISOString().split('T')[0]}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    try {
      await new Promise(resolve => setTimeout(resolve, 300));
      // @ts-ignore
      await window.html2pdf().set(opt).from(container).save();
    } catch (err) {
      console.error("PDF generation failed", err);
      alert("Не удалось сгенерировать PDF. Попробуйте обновить страницу.");
    } finally {
      if (document.body.contains(container)) document.body.removeChild(container);
      setIsGeneratingPdf(false);
    }
  };

  const handleEditAnswers = () => {
      setStep('testing');
      const lastIndex = selectedTests.length - 1;
      setCurrentTestIndex(lastIndex);
      const lastTestId = selectedTests[lastIndex];
      const lastTest = TESTS.find(t => t.id === lastTestId);
      setCurrentQuestionIndex((lastTest?.questions.length || 1) - 1);
      scrollToTop();
  };

  const handleStartSmart = async () => {
    if (!complaints.trim()) return;
    setIsLoading(true);
    setLoadingText("Анализируем клиническую картину...");
    try {
      const recommendedTestIds = await getSmartRecommendations(complaints, depth, TESTS);
      const validTestIds = recommendedTestIds.filter(id => {
          const t = TESTS.find(test => test.id === id);
          return t && (!t.externalUrl || t.questions.length > 0);
      });
      const finalTests = validTestIds.length > 0 ? validTestIds : ['phq9', 'gad7'];
      
      setSelectedTests(finalTests);
      setStep('selection');
      scrollToTop();
    } catch (e: any) {
      console.error(e);
      if (e.message === 'AI_KEY_INVALID') {
        setHasAiKey(false);
        alert("Ошибка ключа AI. Пожалуйста, подключите ключ заново.");
      } else {
        alert("Не удалось загрузить рекомендации. Выберите тесты вручную.");
        setStep('selection');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSmartSelfKnowledge = async () => {
    if (!selfGoal.trim()) return;
    setIsLoading(true);
    setLoadingText("Подбираем методики под ваш запрос...");
    try {
        const ids = await getSelfKnowledgeRecommendations(selfGoal, TESTS);
        // Filter valid
        const validIds = ids.filter(id => TESTS.find(t => t.id === id));
        setSelectedTests(validIds.length > 0 ? validIds : ['bfi10']);
    } catch (e: any) {
        console.error(e);
        if (e.message === 'AI_KEY_INVALID') {
          setHasAiKey(false);
          alert("Ошибка ключа AI. Пожалуйста, подключите ключ заново.");
        } else {
          alert("Ошибка при подборе. Выберите тесты вручную.");
        }
    } finally {
        setIsLoading(false);
    }
  };

  const handleAnswer = (testId: string, qId: number, score: number) => {
    if (isTransitioning) return;
    setIsTransitioning(true);

    setAnswers(prev => ({
      ...prev,
      [testId]: { ...(prev[testId] || {}), [qId]: score }
    }));

    setTimeout(() => {
      if (currentTest && currentQuestionIndex < currentTest.questions.length - 1) {
        setCurrentQuestionIndex(v => v + 1);
        setIsTransitioning(false);
      } else if (currentTestIndex < selectedTests.length - 1) {
        setCurrentTestIndex(v => v + 1);
        setCurrentQuestionIndex(0);
        scrollToTop();
        setIsTransitioning(false);
      } else {
        processResults();
        setIsTransitioning(false); 
      }
    }, 250);
  };

  // Extracted pure logic for calculating results to be used in both processResults and useEffect
  const calculateResultsPure = (testIds: string[], currentAnswers: UserAnswers): TestResult[] => {
      return testIds.map((testId): TestResult | null => {
          const test = TESTS.find(t => t.id === testId);
          if (!test) return null;

          const testAnswers = (currentAnswers[testId] || {}) as Record<number, number>;
          const totalScore = Object.values(testAnswers).reduce((a, b) => a + (b || 0), 0);
          const interp = test.interpretation(testAnswers);
          
          return {
            testId, 
            testName: test.name, 
            score: totalScore,
            interpretation: interp.label + ': ' + interp.description,
            severity: interp.severity,
            details: interp.details,
            subscales: interp.subscales
          };
      }).filter((item): item is TestResult => item !== null);
  };

  const processResults = async () => {
    setIsLoading(true);
    setLoadingText("Обработка результатов...");
    try {
      const newResults = calculateResultsPure(selectedTests, answers);
      setResults(newResults);
      // AI Interpretation is NOT called automatically here anymore.
      setAiInterpretation('');
      setStep('results');
      scrollToTop();
    } catch (error) {
      console.error("Error processing results:", error);
      alert("Произошла ошибка при обработке результатов. Пожалуйста, попробуйте еще раз или выберите меньше тестов.");
      setStep('selection');
    } finally {
      setIsLoading(false);
    }
  };

  const generateAiInterpretation = async () => {
    setIsAiLoading(true);
    try {
        let aggregate = '';
        // Determine which AI mode to use based on how the user entered or their goal
        if (selfGoal && selfGoal.trim().length > 0) {
             // User entered a self-knowledge goal, use the deep personality prompt
             aggregate = await getSelfKnowledgeInterpretation(results, selfGoal);
        } else if (complaints && complaints.trim().length > 0) {
             // User entered clinical complaints
             aggregate = await getAggregateInterpretation(results, complaints);
        } else {
             // Fallback: Check the category of tests. If mostly 'self_knowledge' or 'personality', use personality prompt
             const personalityTestsCount = results.filter(r => {
                 const t = TESTS.find(test => test.id === r.testId);
                 return t && ['personality', 'self_knowledge', 'wellbeing'].includes(t.category);
             }).length;
             
             if (personalityTestsCount > results.length / 2) {
                 aggregate = await getSelfKnowledgeInterpretation(results, "Общее самопознание");
             } else {
                 aggregate = await getAggregateInterpretation(results, "Комплексная диагностика");
             }
        }
        
        setAiInterpretation(aggregate);
    } catch (e: any) {
        console.error(e);
        if (e.message === 'AI_KEY_INVALID') {
          setHasAiKey(false);
          alert("Ошибка ключа AI. Пожалуйста, подключите ключ заново.");
        } else {
          alert("Ошибка при обращении к AI сервису.");
        }
    } finally {
        setIsAiLoading(false);
    }
  };

  const categoryChartData = useMemo(() => {
    const data: Record<string, number> = {};
    results.forEach(res => {
      const test = TESTS.find(t => t.id === res.testId);
      if (test) {
        const categoryName = CATEGORY_LABELS[test.category] || test.category;
        data[categoryName] = (data[categoryName] || 0) + res.score;
      }
    });
    return Object.entries(data).map(([name, score]) => ({ name, score }));
  }, [results]);

  const parseBold = (text: string) => {
    const parts = text.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, index) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <span key={index} className="text-[#4A6D7C] font-extrabold">{part.slice(2, -2)}</span>;
      }
      return part;
    });
  };

  const renderMarkdown = (text: string) => {
    return text.split('\n').map((line, i) => {
      if (!line.trim()) return <div key={i} className="h-3" />;
      
      if (line.startsWith('### ')) {
        const title = line.replace('### ', '').trim();
        let icon = "fa-info-circle";
        let colorClass = "text-slate-700";
        let bgClass = "bg-slate-50/50 border-slate-200/60";

        const tLower = title.toLowerCase();

        // Clinical keywords
        if (tLower.includes("обзор") || tLower.includes("синтез") || tLower.includes("результат") || tLower.includes("портрет")) { 
             icon = "fa-clipboard-check"; 
             colorClass = "text-[#4A6D7C]"; 
             bgClass = "bg-[#4A6D7C]/5 border-[#4A6D7C]/20";
        }
        // Targets / Growth areas
        else if (tLower.includes("мишени") || tLower.includes("цели") || tLower.includes("зоны роста") || tLower.includes("риски")) { 
             icon = "fa-bullseye"; 
             colorClass = "text-indigo-700"; 
             bgClass = "bg-indigo-50/50 border-indigo-200/50";
        }
        // Strengths / Resources
        else if (tLower.includes("ресурсы") || tLower.includes("сильные стороны") || tLower.includes("ответ на запрос")) { 
             icon = "fa-star"; 
             colorClass = "text-amber-600"; 
             bgClass = "bg-amber-50/50 border-amber-200/50";
        }
        // Doctor / Specialist / Recommendations
        else if (tLower.includes("специалист") || tLower.includes("важность") || tLower.includes("рекомендаци")) { 
             icon = "fa-user-doctor"; 
             colorClass = "text-rose-700"; 
             bgClass = "bg-rose-50/50 border-rose-200/50";
        }

        return (
            <div key={i} className={`flex items-center gap-3 mt-8 mb-4 px-5 py-3 rounded-xl border ${bgClass} w-full sm:w-fit backdrop-blur-sm`}>
                <i className={`fas ${icon} ${colorClass} text-lg`}></i>
                <h3 className={`text-lg font-bold ${colorClass}`}>{title}</h3>
            </div>
        );
      }
      
      if (line.startsWith('- ')) {
        return (
          <div key={i} className="flex gap-3 mb-2 ml-1 p-2 rounded-lg hover:bg-slate-50/50 transition-colors">
             <div className="w-1.5 h-1.5 rounded-full bg-[#4A6D7C] mt-2 shrink-0 opacity-60"></div>
             <p className="text-slate-600 text-[15px] leading-relaxed">{parseBold(line.replace('- ', ''))}</p>
          </div>
        );
      }

      return <p key={i} className="mb-3 text-slate-600 leading-relaxed text-[15px] px-1">{parseBold(line)}</p>;
    });
  };

  const Header = () => (
      <header className="flex justify-end items-center py-4 px-2 sm:px-0 mb-4 no-print z-50 relative">
          {step !== 'welcome' && (
              <button 
                  onClick={handleGoHome}
                  className="px-4 py-2 rounded-lg bg-white/60 backdrop-blur-md border border-white/40 text-slate-500 text-xs font-bold uppercase tracking-wider hover:bg-white/80 hover:text-[#4A6D7C] hover:border-[#4A6D7C]/30 transition-all shadow-sm"
              >
                  <i className="fas fa-times sm:mr-2"></i> <span className="hidden sm:inline">Закрыть</span>
              </button>
          )}
      </header>
  );

  const DepthOption = ({ id, label, time, active }: { id: DiagnosticDepth, label: string, time: string, active: boolean }) => (
    <button 
      onClick={() => setDepth(id)}
      className={`flex-1 py-3 px-2 rounded-lg text-xs font-bold transition-all border duration-300 ${
        active 
          ? 'bg-white shadow-md text-[#4A6D7C] border-transparent scale-105 ring-2 ring-[#4A6D7C]/10' 
          : 'bg-white/30 border-transparent text-white/70 hover:bg-white/50 hover:text-white'
      }`}
    >
      <div className="leading-tight">{label}</div>
      <div className={`text-[10px] mt-0.5 opacity-80`}>{time}</div>
    </button>
  );

  const AppointmentButton = () => (
    <a 
      href="https://cnpp.ru/team/" 
      target="_blank" 
      rel="noopener noreferrer"
      className="w-full sm:w-auto py-4 px-8 rounded-xl bg-[#4A6D7C] text-white font-bold hover:bg-[#395561] transition-all shadow-lg shadow-[#4A6D7C]/30 flex items-center justify-center gap-3 group/cta"
    >
      <i className="fas fa-calendar-check group-hover/cta:scale-110 transition-transform"></i>
      Записаться к врачу
    </a>
  );

  if (isLoading) {
    return (
      <div className="max-w-5xl 2xl:max-w-7xl mx-auto py-8 px-4 sm:px-6 relative z-10">
        <Header />
        <div className="max-w-xl mx-auto flex flex-col items-center justify-center min-h-[500px] p-12 text-center glass-panel rounded-[32px] animate-scale-in">
            <div className="relative w-24 h-24 mb-8">
              <div className="absolute inset-0 border-4 border-white/40 rounded-full"></div>
              <div className="absolute inset-0 border-4 border-[#4A6D7C] border-t-transparent rounded-full animate-spin"></div>
              <div className="absolute inset-0 flex items-center justify-center animate-pulse">
                  <i className="fas fa-brain text-[#4A6D7C] text-2xl"></i>
              </div>
            </div>
            <h3 className="text-2xl font-bold text-slate-800 mb-2">{loadingText}</h3>
            <p className="text-slate-500 text-sm">Пожалуйста, подождите, это займет несколько секунд.</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="max-w-5xl 2xl:max-w-7xl mx-auto py-4 px-4 sm:px-6 sm:py-6 font-sans relative z-10">
      <Header />
      
      {/* Container for main content without internal scrolling */}
      <div className="glass-panel rounded-[32px] min-h-[650px] flex flex-col transition-all duration-700 relative">
        <div className="p-4 sm:p-8 flex-grow flex flex-col">
          
          {sharedMessage && (
            <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-xl mb-6 flex items-start gap-4 shadow-sm animate-fade-in-up">
                <div className="text-emerald-500 text-xl mt-0.5"><i className="fas fa-check-circle"></i></div>
                <div>
                    <h3 className="font-bold text-emerald-800 text-sm mb-1">Информация</h3>
                    <p className="text-emerald-700 text-xs">{sharedMessage}</p>
                </div>
                <button onClick={() => setSharedMessage(null)} className="ml-auto text-emerald-400 hover:text-emerald-700"><i className="fas fa-times"></i></button>
            </div>
          )}

          {step === 'welcome' && (
            <div className="animate-fade-in-up space-y-6 flex-grow flex flex-col justify-start py-2">
              <div className="text-center max-w-3xl 2xl:max-w-4xl mx-auto space-y-3 mb-4">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/60 backdrop-blur-md border border-white/40 text-slate-500 text-[11px] font-bold uppercase tracking-wider mb-1 shadow-sm">
                   <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_10px_rgba(52,211,153,0.5)]"></span>
                   Онлайн-диагностика
                </div>
                <h1 className="text-3xl sm:text-5xl 2xl:text-6xl font-extrabold text-slate-900 leading-[1.15] tracking-tight drop-shadow-sm">
                  Система предварительной <br className="hidden sm:block" />
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#4A6D7C] to-[#6B8E9E]">клинической оценки</span>
                </h1>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl 2xl:max-w-7xl mx-auto w-full">
                
                {/* HERO: AI Consultant - Massive Prominent Block */}
                <div className="relative rounded-[32px] md:col-span-2 overflow-hidden shadow-2xl group transition-all duration-500 hover:shadow-[#4A6D7C]/20 border border-[#4A6D7C]/20">
                    <div className="absolute inset-0 bg-gradient-to-br from-[#4A6D7C] to-[#2E4857] z-0"></div>
                    <div className="absolute inset-0 opacity-20 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] mix-blend-overlay"></div>
                    <div className="absolute -right-20 -top-20 w-80 h-80 bg-[#6B8E9E] rounded-full blur-[100px] opacity-40"></div>
                    
                    <div className="relative z-10 p-8 sm:p-12 text-white flex flex-col md:flex-row gap-8 items-center">
                        <div className="flex-1 space-y-6 w-full">
                             <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 backdrop-blur-md rounded-lg text-xs font-bold uppercase tracking-wider text-emerald-300 border border-white/10">
                                <i className="fas fa-sparkles"></i> Рекомендуемый старт
                             </div>
                             <div>
                                 <h2 className="text-3xl sm:text-4xl 2xl:text-5xl font-bold mb-3 leading-tight">Что вас беспокоит?</h2>
                                 <p className="text-white/80 text-sm sm:text-base leading-relaxed max-w-md">
                                     Опишите своими словами. ИИ подберет нужные тесты.
                                 </p>
                             </div>
                             
                             <div className="bg-white/10 p-1.5 rounded-xl flex gap-1 border border-white/10 backdrop-blur-md w-fit">
                                <DepthOption id="express" label="Экспресс" time="5 мин" active={depth === 'express'} />
                                <DepthOption id="standard" label="Стандарт" time="15 мин" active={depth === 'standard'} />
                             </div>
                        </div>

                        <div className="flex-1 w-full bg-white/10 backdrop-blur-xl rounded-3xl p-6 border border-white/10 shadow-xl">
                            <textarea
                                className="w-full h-32 bg-transparent border-none outline-none text-white placeholder:text-white/40 text-sm sm:text-lg resize-none font-medium placeholder:text-xs sm:placeholder:text-lg"
                                placeholder="Например: 'Чувствую апатию, ничего не хочется делать, плохо сплю'..."
                                value={complaints}
                                onChange={(e) => setComplaints(e.target.value)}
                            />
                            <div className="flex justify-end mt-4 pt-4 border-t border-white/10 gap-3">
                                {!hasAiKey && !isCheckingKey && (
                                    <button
                                        onClick={handleOpenKeyDialog}
                                        className="px-6 py-3 bg-amber-500 text-white hover:bg-amber-600 font-extrabold rounded-xl shadow-lg flex items-center gap-2 transition-all transform hover:scale-[1.02] active:scale-[0.98]"
                                    >
                                        <i className="fas fa-key"></i>
                                        <span>Подключить AI</span>
                                    </button>
                                )}
                                {selectedTests.length > 0 && (
                                    <button
                                        onClick={() => { setStep('testing'); setCurrentTestIndex(0); setCurrentQuestionIndex(0); scrollToTop(); }}
                                        className="px-6 py-3 bg-emerald-500 text-white hover:bg-emerald-600 font-extrabold rounded-xl shadow-lg flex items-center gap-2 transition-all transform hover:scale-[1.02] active:scale-[0.98]"
                                    >
                                        <i className="fas fa-play text-[10px]"></i>
                                        <span>Начать ({selectedTests.length})</span>
                                    </button>
                                )}
                                <button
                                    onClick={handleStartSmart}
                                    disabled={!complaints.trim()}
                                    className="px-8 py-3 bg-white text-[#4A6D7C] hover:bg-emerald-50 disabled:opacity-50 disabled:cursor-not-allowed font-extrabold rounded-xl shadow-lg flex items-center gap-3 transition-all transform hover:scale-[1.02] active:scale-[0.98]"
                                >
                                    <span>Подобрать программу</span>
                                    <i className="fas fa-arrow-right"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Secondary Option: Manual Catalog */}
                <div className="rounded-[24px] p-6 bg-white/40 backdrop-blur-md border border-white/60 shadow-lg hover:shadow-xl hover:bg-white/60 transition-all duration-300 hover:translate-y-[-4px] flex flex-col group relative">
                     <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-slate-600 shadow-sm border border-slate-100 mb-4 group-hover:scale-110 transition-transform duration-300">
                        <i className="fas fa-list-check text-xl"></i>
                     </div>
                     <h3 className="text-xl font-bold text-slate-800 mb-1">Каталог шкал</h3>
                     <p className="text-slate-500 text-xs leading-relaxed mb-6">
                       Выбор конкретных клинических методик (PHQ-9, HADS, BDI-II, и др.).
                     </p>
                     <button 
                      onClick={() => { setStep('selection'); scrollToTop(); }} 
                      className="mt-auto w-full py-3 rounded-xl border border-slate-300/50 bg-white/50 text-slate-600 font-bold hover:bg-white hover:text-slate-800 transition-all text-xs shadow-sm active:scale-[0.98]"
                    >
                      Открыть список
                    </button>
                </div>

                 {/* Secondary Option: Self-Knowledge */}
                <div className="rounded-[24px] p-6 bg-gradient-to-br from-indigo-600 to-violet-700 backdrop-blur-md border border-indigo-400/30 shadow-xl hover:shadow-2xl hover:scale-[1.02] transition-all duration-300 flex flex-col group relative overflow-hidden">
                     <div className="absolute -right-4 -top-4 w-24 h-24 bg-white/10 rounded-full blur-2xl group-hover:bg-white/20 transition-colors"></div>
                     <div className="w-12 h-12 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center text-white shadow-sm border border-white/20 mb-4 group-hover:scale-110 transition-transform duration-300">
                        <i className="fas fa-fingerprint text-xl"></i>
                     </div>
                     <h3 className="text-xl font-bold text-white mb-1">Лаборатория Я</h3>
                     <p className="text-indigo-100 text-xs leading-relaxed mb-6">
                       Глубинные тесты личности, характера и темперамента (Big5, 16PF, и др.).
                     </p>
                     <button 
                      onClick={() => { setStep('self_knowledge_selection'); scrollToTop(); }} 
                      className="mt-auto w-full py-3 rounded-xl bg-white text-indigo-700 font-bold hover:bg-indigo-50 transition-all text-xs shadow-lg active:scale-[0.98]"
                    >
                      Перейти в лабораторию
                    </button>
                </div>

                {/* New Option: Disease Database */}
                <div className="rounded-[24px] p-6 bg-gradient-to-br from-rose-50/40 to-white/40 backdrop-blur-md border border-rose-100/60 shadow-lg hover:shadow-xl hover:bg-white/60 transition-all duration-300 hover:translate-y-[-4px] flex flex-col group relative md:col-span-2">
                     <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-rose-600 shadow-sm border border-rose-100 mb-4 group-hover:scale-110 transition-transform duration-300">
                        <i className="fas fa-book-medical text-xl"></i>
                     </div>
                     <h3 className="text-xl font-bold text-slate-800 mb-1">База знаний (cnpp.ru)</h3>
                     <p className="text-slate-500 text-xs leading-relaxed mb-6">
                       Справочник психических расстройств: описание, симптомы и рекомендации по лечению.
                     </p>
                     <button 
                      onClick={() => { setStep('diseases'); scrollToTop(); }} 
                      className="mt-auto w-full py-3 rounded-xl bg-rose-50/50 border border-rose-200/50 text-rose-700 font-bold hover:bg-rose-600 hover:text-white transition-all text-xs shadow-sm active:scale-[0.98]"
                    >
                      Открыть базу знаний
                    </button>
                </div>

                {/* New Option: FAQ */}
                <div className="rounded-[24px] p-6 bg-white/40 backdrop-blur-md border border-slate-200/50 shadow-lg hover:shadow-xl hover:bg-white/60 transition-all duration-300 hover:translate-y-[-4px] flex flex-col group relative md:col-span-2">
                     <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-600 shadow-sm border border-slate-200 mb-4 group-hover:scale-110 transition-transform duration-300">
                        <i className="fas fa-question-circle text-xl"></i>
                     </div>
                     <h3 className="text-xl font-bold text-slate-800 mb-1">Часто задаваемые вопросы</h3>
                     <p className="text-slate-500 text-xs leading-relaxed mb-6">
                       Узнайте больше о том, как работает приложение, о конфиденциальности данных и интерпретации результатов.
                     </p>
                     <button 
                      onClick={() => { setStep('faq'); scrollToTop(); }} 
                      className="mt-auto w-full py-3 rounded-xl bg-slate-100 border border-slate-200 text-slate-700 font-bold hover:bg-slate-200 transition-all text-xs shadow-sm active:scale-[0.98]"
                    >
                      Смотреть FAQ
                    </button>
                </div>

              </div>

              {/* Safety Disclaimer */}
              <div className="max-w-4xl mx-auto w-full px-2 mt-4">
                 <div className="rounded-2xl p-4 bg-amber-50/60 border border-amber-100/50 backdrop-blur-sm flex flex-col sm:flex-row items-start gap-4 shadow-sm">
                    <div className="shrink-0 w-10 h-10 rounded-full bg-amber-100/80 flex items-center justify-center text-amber-600">
                        <i className="fas fa-shield-heart"></i>
                    </div>
                    <div>
                        <h4 className="font-bold text-slate-800 text-sm mb-1">Медицинский дисклеймер</h4>
                        <p className="text-xs text-slate-600 leading-relaxed">
                            Результаты тестирования носят исключительно информационный характер и <strong className="text-slate-700">не являются клиническим диагнозом</strong>. 
                        </p>
                    </div>
                 </div>
              </div>
            </div>
          )}

          {step === 'faq' && (
            <div className="animate-fade-in-up space-y-8 max-w-3xl mx-auto w-full">
                <div className="flex items-center justify-between pb-4 border-b border-slate-200/50">
                    <button onClick={() => setStep('welcome')} className="text-slate-400 hover:text-slate-600 text-sm font-bold flex items-center gap-2 transition-colors">
                        <i className="fas fa-arrow-left"></i> Назад
                    </button>
                    <h2 className="text-2xl font-bold text-slate-900">Часто задаваемые вопросы</h2>
                    <div className="w-10"></div> {/* Spacer */}
                </div>

                <div className="space-y-4">
                    {FAQ_DATA.map((item, index) => (
                        <details key={index} className="group bg-white/50 backdrop-blur-md border border-slate-200/60 rounded-2xl overflow-hidden transition-all hover:bg-white/80">
                            <summary className="flex items-center justify-between p-6 cursor-pointer list-none">
                                <h3 className="font-bold text-slate-800 pr-4">{item.question}</h3>
                                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 group-open:rotate-180 transition-transform duration-300">
                                    <i className="fas fa-chevron-down text-xs"></i>
                                </div>
                            </summary>
                            <div className="px-6 pb-6 text-slate-600 text-sm leading-relaxed animate-fade-in">
                                {item.answer}
                            </div>
                        </details>
                    ))}
                </div>

                <div className="bg-indigo-50/50 border border-indigo-100 p-6 rounded-3xl text-center">
                    <h4 className="font-bold text-indigo-900 mb-2">Остались вопросы?</h4>
                    <p className="text-indigo-700 text-xs mb-4">Если вы не нашли ответ на свой вопрос, вы всегда можете обратиться к специалистам клиники «Диалектика».</p>
                    <AppointmentButton />
                </div>
            </div>
          )}

          {step === 'selection' && (
            <div className="animate-fade-in-up space-y-8 max-w-4xl 2xl:max-w-5xl mx-auto w-full">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-4 border-b border-slate-200/50 gap-4">
                <div className="flex items-center gap-4">
                    <button onClick={() => setStep('welcome')} className="text-slate-400 hover:text-[#4A6D7C] text-sm font-bold flex items-center gap-2 transition-colors">
                    <i className="fas fa-arrow-left"></i> Назад
                    </button>
                    <h2 className="text-2xl font-bold text-slate-900">Каталог методик</h2>
                </div>
                <div className="flex items-center gap-3 w-full sm:w-auto">
                    <div className="bg-[#4A6D7C]/10 px-4 py-2 rounded-xl text-xs font-bold text-[#4A6D7C] backdrop-blur-sm whitespace-nowrap">
                    Выбрано: {selectedTests.length}
                    </div>
                    {selectedTests.length > 0 && (
                        <button
                            onClick={() => { setStep('testing'); setCurrentTestIndex(0); setCurrentQuestionIndex(0); scrollToTop(); }}
                            className="flex-grow sm:flex-grow-0 bg-emerald-500 text-white font-bold py-2.5 px-8 rounded-xl shadow-lg text-sm hover:bg-emerald-600 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                        >
                            <i className="fas fa-play text-[10px]"></i>
                            Начать ({selectedTests.length})
                        </button>
                    )}
                </div>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {TESTS.filter(t => t.category !== 'self_knowledge' && t.category !== 'personality' && t.category !== 'wellbeing').map(test => (
                  <TestGridCard 
                    key={test.id} 
                    test={test} 
                    onClick={() => setSelectedTests(prev => prev.includes(test.id) ? prev.filter(id => id !== test.id) : [...prev, test.id])}
                    isSelected={selectedTests.includes(test.id)}
                  />
                ))}
              </div>

               <div className="flex justify-center pt-4 border-t border-slate-200/50 flex-col sm:flex-row gap-4">
                 <button
                  disabled={selectedTests.length === 0}
                  onClick={handleShareBattery}
                  className="bg-white hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed text-slate-600 border border-slate-300 font-bold py-4 px-8 rounded-xl shadow-sm transition-all text-sm active:scale-[0.98] w-full sm:w-auto"
                >
                  <i className="fas fa-share-alt mr-2 text-[#4A6D7C]"></i>
                  Создать ссылку на тест
                </button>
                
                <button
                  disabled={selectedTests.length === 0}
                  onClick={() => { setStep('testing'); setCurrentTestIndex(0); setCurrentQuestionIndex(0); scrollToTop(); }}
                  className="bg-[#4A6D7C] hover:bg-[#395561] disabled:opacity-30 disabled:cursor-not-allowed text-white font-bold py-4 px-12 rounded-xl shadow-xl shadow-[#4A6D7C]/20 transition-all text-sm active:scale-[0.98] w-full sm:w-auto hover:translate-y-[-2px]"
                >
                  Начать тестирование ({selectedTests.length})
                </button>
              </div>

              {/* Sticky Mobile Footer for Selection */}
              {selectedTests.length > 0 && (
                <div className="fixed bottom-6 left-4 right-4 z-[100] sm:hidden animate-fade-in-up">
                  <button
                    onClick={() => { setStep('testing'); setCurrentTestIndex(0); setCurrentQuestionIndex(0); scrollToTop(); }}
                    className="w-full bg-[#4A6D7C] text-white font-bold py-4 rounded-2xl shadow-2xl flex items-center justify-center gap-3 active:scale-[0.98] border-2 border-white/20"
                  >
                    <i className="fas fa-play"></i>
                    Начать тестирование ({selectedTests.length})
                  </button>
                </div>
              )}
            </div>
          )}

          {step === 'self_knowledge_selection' && (
             <div className="animate-fade-in-up space-y-8 max-w-4xl 2xl:max-w-5xl mx-auto w-full">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-4 border-b border-slate-200/50 gap-4">
                    <div className="flex items-center gap-4">
                        <button onClick={() => setStep('welcome')} className="text-slate-400 hover:text-[#4A6D7C] text-sm font-bold flex items-center gap-2 transition-colors">
                            <i className="fas fa-arrow-left"></i> Назад
                        </button>
                        <h2 className="text-2xl font-bold text-indigo-900">Лаборатория Я</h2>
                    </div>
                    <div className="flex items-center gap-3 w-full sm:w-auto">
                        <div className="bg-indigo-100 px-4 py-2 rounded-xl text-xs font-bold text-indigo-700 backdrop-blur-sm whitespace-nowrap">
                        Выбрано: {selectedTests.length}
                        </div>
                        {selectedTests.length > 0 && (
                            <button
                                onClick={() => { setStep('testing'); setCurrentTestIndex(0); setCurrentQuestionIndex(0); scrollToTop(); }}
                                className="flex-grow sm:flex-grow-0 bg-emerald-500 text-white font-bold py-2.5 px-8 rounded-xl shadow-lg text-sm hover:bg-emerald-600 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                            >
                                <i className="fas fa-play text-[10px]"></i>
                                Начать ({selectedTests.length})
                            </button>
                        )}
                    </div>
                </div>

                {/* Self Knowledge AI Helper */}
                <div className="relative rounded-[20px] overflow-hidden shadow-lg border border-indigo-200/50">
                    <div className="absolute inset-0 bg-gradient-to-r from-indigo-600 to-violet-600 z-0"></div>
                    <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]"></div>
                    
                    <div className="relative z-10 p-6 flex flex-col md:flex-row gap-6 items-center">
                        <div className="flex-1 text-white">
                             <div className="inline-flex items-center gap-2 px-2 py-1 bg-white/20 rounded-lg text-[10px] font-bold uppercase tracking-wider mb-2">
                                <i className="fas fa-wand-magic-sparkles"></i> AI Ассистент
                             </div>
                             <h3 className="text-xl font-bold mb-2">Не знаете, с чего начать?</h3>
                             <p className="text-white/80 text-xs leading-relaxed max-w-sm">
                                 Опишите, что вы хотите узнать о себе (например: "почему у меня проблемы в отношениях" или "какая карьера мне подходит").
                             </p>
                        </div>
                        {/* Modified Layout for Mobile: Stacked Flex */}
                        <div className="flex-1 w-full bg-white/10 backdrop-blur-md rounded-xl p-3 border border-white/20 flex flex-col gap-2">
                            {!hasAiKey && !isCheckingKey && (
                                <button
                                    onClick={handleOpenKeyDialog}
                                    className="w-full px-6 py-3 bg-amber-500 text-white hover:bg-amber-600 font-extrabold rounded-xl shadow-lg flex items-center justify-center gap-2 transition-all transform hover:scale-[1.02] active:scale-[0.98]"
                                >
                                    <i className="fas fa-key"></i>
                                    <span>Подключить AI для анализа</span>
                                </button>
                            )}
                            <div className="flex flex-col sm:flex-row gap-2">
                                <input
                                    type="text"
                                    className="flex-grow bg-transparent border-none outline-none text-white placeholder:text-white/50 text-sm px-2 h-10"
                                    placeholder="Например: 'Мои сильные стороны в карьере'..."
                                    value={selfGoal}
                                    onChange={(e) => setSelfGoal(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSmartSelfKnowledge()}
                                />
                                <button
                                    onClick={handleSmartSelfKnowledge}
                                    disabled={!selfGoal.trim()}
                                    className="w-full sm:w-auto px-6 py-2 bg-white text-indigo-600 hover:bg-indigo-50 disabled:opacity-50 font-bold rounded-lg text-xs shadow-md transition-all whitespace-nowrap h-10 flex items-center justify-center"
                                >
                                    Подобрать
                                </button>
                            </div>
                            {selectedTests.length > 0 && (
                                <button
                                    onClick={() => { setStep('testing'); setCurrentTestIndex(0); setCurrentQuestionIndex(0); scrollToTop(); }}
                                    className="w-full bg-emerald-500 text-white hover:bg-emerald-600 font-bold rounded-xl py-3 shadow-lg transition-all flex items-center justify-center gap-2 animate-fade-in"
                                >
                                    <i className="fas fa-play text-[10px]"></i>
                                    Начать тестирование ({selectedTests.length})
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {TESTS.filter(t => t.category === 'personality' || t.category === 'self_knowledge' || t.category === 'wellbeing' || t.category === 'burnout').map(test => (
                        <TestGridCard 
                        key={test.id} 
                        test={test} 
                        onClick={() => setSelectedTests(prev => prev.includes(test.id) ? prev.filter(id => id !== test.id) : [...prev, test.id])}
                        isSelected={selectedTests.includes(test.id)}
                        />
                    ))}
                </div>

                 <div className="flex justify-center pt-4 border-t border-slate-200/50 flex-col sm:flex-row gap-4">
                     <button
                        disabled={selectedTests.length === 0}
                        onClick={handleShareBattery}
                        className="bg-white hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed text-indigo-600 border border-indigo-100 font-bold py-4 px-8 rounded-xl shadow-sm transition-all text-sm active:scale-[0.98] w-full sm:w-auto"
                        >
                        <i className="fas fa-share-alt mr-2"></i>
                        Создать ссылку на тест
                    </button>

                    <button
                        disabled={selectedTests.length === 0}
                        onClick={() => { setStep('testing'); setCurrentTestIndex(0); setCurrentQuestionIndex(0); scrollToTop(); }}
                        className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-30 disabled:cursor-not-allowed text-white font-bold py-4 px-12 rounded-xl shadow-xl shadow-indigo-600/20 transition-all text-sm active:scale-[0.98] w-full sm:w-auto hover:translate-y-[-2px]"
                    >
                        Начать исследование ({selectedTests.length})
                    </button>
                </div>

                {/* Sticky Mobile Footer for Self-Knowledge */}
                {selectedTests.length > 0 && (
                    <div className="fixed bottom-6 left-4 right-4 z-[100] sm:hidden animate-fade-in-up">
                    <button
                        onClick={() => { setStep('testing'); setCurrentTestIndex(0); setCurrentQuestionIndex(0); scrollToTop(); }}
                        className="w-full bg-indigo-600 text-white font-bold py-4 rounded-2xl shadow-2xl flex items-center justify-center gap-3 active:scale-[0.98] border-2 border-white/20"
                    >
                        <i className="fas fa-play"></i>
                        Начать исследование ({selectedTests.length})
                    </button>
                    </div>
                )}
             </div>
          )}

          {step === 'diseases' && (
            <div className="animate-fade-in-up space-y-8 max-w-4xl 2xl:max-w-5xl mx-auto w-full">
                <div className="flex flex-col sm:flex-row items-center justify-between pb-4 border-b border-slate-200/50 gap-4">
                    <button onClick={() => setStep('welcome')} className="text-slate-400 hover:text-rose-600 text-sm font-bold flex items-center gap-2 transition-colors self-start sm:self-center">
                        <i className="fas fa-arrow-left"></i> Назад
                    </button>
                    <h2 className="text-2xl font-bold text-rose-900">База знаний (cnpp.ru)</h2>
                    <div className="relative w-full sm:w-64">
                        <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
                        <input 
                            type="text" 
                            placeholder="Поиск расстройства..."
                            className="w-full pl-9 pr-4 py-2 rounded-xl bg-white/50 border border-slate-200 text-sm outline-none focus:border-rose-300 transition-all"
                            value={diseaseSearch}
                            onChange={(e) => setDiseaseSearch(e.target.value)}
                        />
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-6">
                    {DISEASES.filter(d => 
                        d.name.toLowerCase().includes(diseaseSearch.toLowerCase()) || 
                        d.description.toLowerCase().includes(diseaseSearch.toLowerCase())
                    ).map(disease => (
                        <div key={disease.id} className="glass-card rounded-2xl p-6 sm:p-8 space-y-6 border-rose-100/30">
                            <div className="flex items-start justify-between gap-4">
                                <div className="space-y-2">
                                    <h3 className="text-xl sm:text-2xl font-bold text-slate-800">{disease.name}</h3>
                                    <p className="text-slate-600 leading-relaxed">{disease.description}</p>
                                </div>
                                <div className="shrink-0 w-12 h-12 rounded-2xl bg-rose-50 flex items-center justify-center text-rose-500">
                                    <i className="fas fa-notes-medical text-xl"></i>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-3">
                                    <h4 className="text-sm font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                                        <i className="fas fa-list-ul text-rose-400"></i> Характерные симптомы
                                    </h4>
                                    <ul className="space-y-2">
                                        {disease.symptoms.map((symptom, idx) => (
                                            <li key={idx} className="flex items-start gap-3 text-sm text-slate-600">
                                                <i className="fas fa-check text-rose-300 mt-1 text-[10px]"></i>
                                                {symptom}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                                <div className="space-y-3">
                                    <h4 className="text-sm font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                                        <i className="fas fa-user-md text-rose-400"></i> Рекомендации
                                    </h4>
                                    <div className="p-4 rounded-xl bg-rose-50/50 border border-rose-100/50 text-sm text-slate-700 leading-relaxed italic">
                                        {disease.recommendations}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                    {DISEASES.filter(d => 
                        d.name.toLowerCase().includes(diseaseSearch.toLowerCase()) || 
                        d.description.toLowerCase().includes(diseaseSearch.toLowerCase())
                    ).length === 0 && (
                        <div className="text-center py-12 text-slate-400 italic">
                            Ничего не найдено по вашему запросу.
                        </div>
                    )}
                </div>

                <div className="flex justify-center pt-8">
                    <AppointmentButton />
                </div>
            </div>
          )}

          {step === 'testing' && (
            <div className="flex flex-col h-full relative max-w-3xl 2xl:max-w-4xl mx-auto w-full">
              {currentTest && currentQuestion ? (
              <div key={currentQuestion.id} className="animate-fade-in-up flex-grow flex flex-col">
                <div className="mb-8 sm:mb-12 space-y-6">
                  <div className="flex justify-between items-center px-1">
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-[#4A6D7C] uppercase tracking-wide mb-1">{currentTest.name}</span>
                      <span className="text-sm font-medium text-slate-500">Тест {currentTestIndex + 1} из {selectedTests.length}</span>
                    </div>
                    <div className="text-right">
                       <span className="text-3xl font-bold text-slate-300 tracking-tighter">{currentQuestionIndex + 1}<span className="text-base text-slate-300/60 font-medium">/{currentTest.questions.length}</span></span>
                    </div>
                  </div>
                  <div className="h-2 bg-slate-100/50 rounded-full overflow-hidden backdrop-blur-sm border border-slate-100">
                    <div className="h-full bg-gradient-to-r from-[#4A6D7C] to-[#6B8E9E] rounded-full transition-all duration-700 ease-in-out relative" style={{ width: `${((currentQuestionIndex + 1) / currentTest.questions.length) * 100}%` }}>
                        <div className="absolute right-0 top-0 bottom-0 w-2 bg-white/30 blur-[2px]"></div>
                    </div>
                  </div>
                </div>

                <div className="flex-grow space-y-6 sm:space-y-10">
                  <div>
                    <h2 className="text-xl sm:text-3xl font-bold text-slate-900 leading-tight mb-4 drop-shadow-sm">{currentQuestion.text}</h2>
                    <p className="text-slate-500 text-xs sm:text-sm flex items-start gap-3 bg-white/40 p-4 rounded-xl border border-white/60 backdrop-blur-sm shadow-sm">
                      <i className="fas fa-info-circle text-[#4A6D7C] mt-0.5"></i>
                      {currentTest.instructions}
                    </p>
                  </div>

                  <div className="space-y-3">
                    {currentQuestion.options.map((opt, idx) => {
                      const isSelected = answers[currentTest.id]?.[currentQuestion.id] === opt.score;
                      const pressKey = `${currentTest.id}-${currentQuestion.id}-${idx}`;
                      const isPressed = pressedAnswerKey === pressKey;
                      return (
                        <button
                          key={idx}
                          disabled={isTransitioning}
                          onClick={() => {
                            setPressedAnswerKey(pressKey);
                            setTimeout(() => setPressedAnswerKey(null), 200);
                            handleAnswer(currentTest.id, currentQuestion.id, opt.score);
                          }}
                          className={`w-full p-4 sm:p-5 text-left rounded-xl sm:rounded-2xl border sm:border-2 transition-all duration-200 flex items-center justify-between group relative overflow-hidden ${
                            isSelected
                              ? 'border-[#4A6D7C] bg-[#4A6D7C] text-white shadow-lg shadow-[#4A6D7C]/20'
                              : 'border-white/60 bg-white/40 text-slate-700 hover:border-[#4A6D7C]/50 hover:bg-white/80 hover:shadow-md'
                          } ${isTransitioning ? 'cursor-not-allowed opacity-80' : ''} ${isPressed ? 'scale-[0.98]' : 'scale-100'}`}
                        >
                          <span className="font-semibold text-sm sm:text-base relative z-10">{opt.text}</span>
                          {isSelected && <i className="fas fa-check text-white relative z-10 animate-scale-in"></i>}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-8 sm:mt-12 pt-6 flex justify-between items-center border-t border-slate-200/50">
                  <button 
                    onClick={() => {
                      if (currentQuestionIndex > 0) {
                        setCurrentQuestionIndex(v => v - 1);
                      } else if (currentTestIndex > 0) {
                        const newTestIdx = currentTestIndex - 1;
                        setCurrentTestIndex(newTestIdx);
                        const prevTestId = selectedTests[newTestIdx];
                        const prevTest = TESTS.find(t => t.id === prevTestId);
                        setCurrentQuestionIndex((prevTest?.questions.length || 1) - 1);
                        scrollToTop();
                      } else {
                        setStep('selection');
                        scrollToTop();
                      }
                    }}
                    className="text-slate-400 hover:text-[#4A6D7C] text-sm font-bold flex items-center gap-2 transition-colors px-4 py-2 hover:bg-white/50 rounded-lg"
                  >
                    <i className="fas fa-arrow-left"></i> Назад
                  </button>
                  
                  <button 
                    onClick={handleGoHome}
                    className="text-slate-300 hover:text-red-500 text-xs font-bold uppercase tracking-wider transition-colors px-4 py-2 hover:bg-red-50/50 rounded-lg"
                  >
                    Прервать
                  </button>
                </div>
              </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full space-y-4 py-20">
                    <i className="fas fa-exclamation-circle text-slate-300 text-4xl"></i>
                    <p className="text-slate-500">Ошибка загрузки вопроса.</p>
                    <button onClick={resetApp} className="text-[#4A6D7C] font-bold border-b-2 border-[#4A6D7C]/20 hover:border-[#4A6D7C]">Вернуться в меню</button>
                </div>
              )}
            </div>
          )}

          {step === 'results' && (
            <div className="animate-fade-in-up space-y-12 max-w-4xl 2xl:max-w-5xl mx-auto w-full">
              
              {/* Wrapped content for PDF generation */}
                <div id="printable-results" className="p-4 sm:p-8 bg-white/90 rounded-[2rem] shadow-sm">
                <div className="text-center space-y-4 pb-8 border-b border-slate-200/50">
                    <div className="inline-block px-3 py-1 bg-emerald-50/80 text-emerald-600 rounded-full text-[11px] font-bold uppercase tracking-wider mb-2 border border-emerald-100/50 backdrop-blur-sm">
                        {isSharedView ? 'Результаты пациента' : 'Диагностика завершена'}
                    </div>
                    <h1 className="text-3xl sm:text-5xl font-extrabold text-slate-900 tracking-tight">Результаты тестирования</h1>
                    <p className="text-slate-500 max-w-lg mx-auto text-sm sm:text-lg leading-relaxed">
                    Ниже представлен анализ вашего состояния и рекомендации по дальнейшим шагам.
                    </p>
                </div>

                {/* 1. CHART Visualization (Main Categories) */}
                <div className="mt-10 chart-container">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-6 pl-1 flex items-center gap-2">
                        <i className="fas fa-chart-bar text-[#4A6D7C]"></i>
                        Общая картина (по категориям)
                    </h3>
                    <div className="h-64 sm:h-80 w-full bg-white/40 rounded-3xl p-4 sm:p-6 border border-white/60 backdrop-blur-sm shadow-inner overflow-hidden">
                        <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={categoryChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(203, 213, 225, 0.5)" />
                            <XAxis 
                                dataKey="name" 
                                axisLine={false} 
                                tickLine={false} 
                                tick={{ fill: '#64748b', fontSize: 10, fontWeight: 600 }} 
                                interval={0}
                                angle={-15}
                                textAnchor="end"
                                height={40}
                            />
                            <YAxis hide />
                            <Tooltip 
                            cursor={{ fill: 'rgba(255,255,255,0.5)' }}
                            content={({ active, payload }) => {
                                if (active && payload && payload.length) {
                                return (
                                    <div className="bg-slate-800/90 backdrop-blur text-white text-xs p-3 rounded-xl shadow-xl border border-slate-700">
                                    <span className="font-bold block mb-1 text-sm">{payload[0].payload.name}</span>
                                    <span>Баллы: {payload[0].value}</span>
                                    </div>
                                );
                                }
                                return null;
                            }}
                            />
                            <Bar dataKey="score" radius={[8, 8, 0, 0]} barSize={window.innerWidth < 640 ? 30 : 50} animationDuration={1500}>
                            {categoryChartData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill="url(#colorGradient)" />
                            ))}
                            </Bar>
                            <defs>
                                <linearGradient id="colorGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#4A6D7C" stopOpacity={1}/>
                                <stop offset="100%" stopColor="#4A6D7C" stopOpacity={0.6}/>
                                </linearGradient>
                            </defs>
                        </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* 2. Test Cards - Grid Layout */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
                    {results.map((r, i) => {
                    const badge = severityMap[r.severity] || severityMap.normal;
                    const testDef = TESTS.find(t => t.id === r.testId);
                    
                    // Simple max score estimation for progress bar if not provided
                    const maxScoreMap: Record<string, number> = {
                        'phq9': 27, 'gad7': 21, 'bfi10': 50, 'pcl5': 80, 'ders36': 180, 'mbi': 132
                    };
                    const maxS = maxScoreMap[r.testId] || (r.score * 1.5) || 100;
                    const percent = Math.min((r.score / maxS) * 100, 100);

                    return (
                    <div key={i} className="glass-card rounded-3xl p-6 sm:p-8 flex flex-col h-full animate-fade-in-up border-white/40" style={{ animationDelay: `${i * 100}ms` }}>
                        
                        {/* Header */}
                        <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-6">
                            <div className="flex-1">
                                <h3 className="font-extrabold text-slate-900 text-xl sm:text-2xl leading-tight tracking-tight">{r.testName}</h3>
                                <div className={`inline-flex items-center gap-1.5 mt-3 px-3 py-1.5 rounded-full text-[11px] font-extrabold uppercase tracking-wider border backdrop-blur-sm ${badge.color}`}>
                                    <span className={`w-2 h-2 rounded-full ${r.severity === 'normal' ? 'bg-emerald-500' : 'bg-current opacity-60'}`}></span>
                                    {badge.label}
                                </div>
                            </div>
                            <div className="flex items-center gap-3 sm:flex-col sm:items-end sm:gap-0 bg-white/50 sm:bg-transparent p-3 sm:p-0 rounded-2xl w-full sm:w-auto border border-white/60 sm:border-0">
                                <div className="text-4xl font-black text-[#4A6D7C] leading-none">{r.score}</div>
                                <div className="text-[11px] text-slate-400 font-bold uppercase tracking-widest sm:mt-1">Баллов</div>
                            </div>
                        </div>

                        {/* Progress Bar */}
                        <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden mb-4">
                             <div className={`h-full rounded-full transition-all duration-1000 ${badge.color.replace('bg-', 'bg-').replace('/80', '')}`} style={{ width: `${percent}%` }}></div>
                        </div>
                        
                        {/* Life Impact */}
                        <div className="p-3 bg-white/40 rounded-xl border border-white/50 mb-4 flex-grow">
                            <p className="text-xs text-slate-600 italic leading-relaxed">"{badge.lifeImpact}"</p>
                        </div>

                        <p className="text-sm text-slate-700 font-medium mb-4">{r.interpretation}</p>

                        {/* Subscales Visualization - Compact */}
                        {r.subscales && r.subscales.length > 0 && (
                        <div className="mt-auto pt-4 border-t border-slate-200/50 space-y-3">
                            {r.subscales.slice(0, 4).map((sub, idx) => ( // Limit displayed subscales to keep card compact
                            <div key={idx} className="flex flex-col gap-1">
                                <div className="flex justify-between text-[11px] font-bold text-slate-500">
                                    <span>{sub.name}</span>
                                    <span>{sub.score}/{sub.maxScore}</span>
                                </div>
                                <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                                    <div 
                                        className="h-full bg-slate-400 rounded-full" 
                                        style={{ width: `${Math.min((sub.score / sub.maxScore) * 100, 100)}%` }}
                                    ></div>
                                </div>
                            </div>
                            ))}
                            {r.subscales.length > 4 && <div className="text-[10px] text-slate-400 text-center">+ еще {r.subscales.length - 4} показателей</div>}
                        </div>
                        )}

                        {/* Detailed Answers Section (Collapsible) */}
                        <details className="mt-4 pt-2 border-t border-slate-100/50 group">
                            <summary className="cursor-pointer text-[11px] font-bold text-slate-400 uppercase tracking-wide hover:text-[#4A6D7C] list-none flex items-center gap-2 select-none transition-colors w-fit">
                                <i className="fas fa-chevron-right text-[9px] group-open:rotate-90 transition-transform duration-200"></i>
                                Детализация ответов
                            </summary>
                            <div className="mt-3 grid gap-1 bg-white/60 p-3 rounded-xl text-xs border border-white/60">
                                {testDef?.questions.map((q, idx) => {
                                    const userScore = answers[r.testId]?.[q.id];
                                    const selectedOption = q.options.find(o => o.score === userScore);
                                    return (
                                        <div key={q.id} className="flex justify-between items-start gap-2 border-b border-slate-100/50 pb-1.5 mb-1.5 last:border-0 last:pb-0 last:mb-0">
                                            <div className="flex gap-2 text-slate-600">
                                                <span className="font-bold opacity-50">{idx + 1}.</span>
                                                <span className="leading-tight">{q.text}</span>
                                            </div>
                                            <div className="shrink-0 text-right">
                                                <span className="block font-bold text-[#4A6D7C] bg-[#4A6D7C]/10 px-1.5 py-0.5 rounded">{userScore ?? '-'}</span>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </details>
                    </div>
                    );
                    })}
                </div>

                {/* 3. AI Conclusion with CTA - Only visible if generated */}
                {aiInterpretation ? (
                <div className="mt-12 glass-panel rounded-[24px] p-6 sm:p-10 relative overflow-hidden group border-indigo-100/50">
                    <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-indigo-600 to-violet-600"></div>
                    <div className="absolute -right-10 -top-10 w-40 h-40 bg-indigo-600/5 rounded-full blur-3xl group-hover:bg-indigo-600/10 transition-colors duration-500"></div>
                    
                    <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 mb-8 pb-6 border-b border-slate-200/50 relative z-10">
                    <div className="flex items-center gap-4 sm:gap-5">
                        <div className="w-14 h-14 sm:w-16 sm:h-16 bg-gradient-to-br from-indigo-600 to-violet-700 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-indigo-600/20 transform group-hover:scale-105 transition-transform duration-300 shrink-0">
                            <i className="fas fa-file-medical-alt text-xl sm:text-2xl"></i>
                        </div>
                        <div>
                            <h2 className="text-xl sm:text-2xl font-bold text-slate-800">Клиническое заключение</h2>
                            <p className="text-[10px] sm:text-xs text-slate-400 uppercase tracking-wide font-bold mt-1">AI-анализ результатов</p>
                        </div>
                    </div>
                    
                    <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
                        <button
                            onClick={generateAiInterpretation}
                            disabled={isAiLoading}
                            className="px-5 py-2.5 bg-white border border-slate-200 text-slate-600 font-semibold rounded-xl hover:bg-slate-50 transition-all text-sm flex items-center gap-2 disabled:opacity-50"
                        >
                            {isAiLoading ? <><i className="fas fa-circle-notch fa-spin"></i> Анализируем...</> : <><i className="fas fa-rotate-right"></i> Повторить анализ</>}
                        </button>
                        <AppointmentButton />
                    </div>
                    </div>
                    
                    <div className="prose prose-slate max-w-none text-slate-600 relative z-10 text-sm sm:text-base leading-relaxed">
                    {renderMarkdown(aiInterpretation)}
                    </div>
                </div>
                ) : (
                    // AI Request Button
                    <div className="mt-12 text-center no-print">
                        {!hasAiKey && !isCheckingKey ? (
                            <div className="max-w-md mx-auto p-6 bg-amber-50 border border-amber-200 rounded-2xl shadow-sm">
                                <i className="fas fa-key text-amber-500 text-2xl mb-3"></i>
                                <h4 className="font-bold text-amber-900 mb-2">AI не подключен</h4>
                                <p className="text-xs text-amber-700 mb-4">Для получения расшифровки от искусственного интеллекта необходимо подключить API ключ.</p>
                                <button
                                    onClick={handleOpenKeyDialog}
                                    className="w-full px-6 py-3 bg-amber-500 text-white hover:bg-amber-600 font-extrabold rounded-xl shadow-lg flex items-center justify-center gap-2 transition-all transform hover:scale-[1.02] active:scale-[0.98]"
                                >
                                    <i className="fas fa-plug"></i>
                                    <span>Подключить AI</span>
                                </button>
                            </div>
                        ) : (
                            <>
                                <button
                                  onClick={generateAiInterpretation}
                                  disabled={isAiLoading}
                                  className="px-8 py-4 bg-gradient-to-r from-[#4A6D7C] to-[#2E4857] text-white font-bold rounded-2xl shadow-xl hover:shadow-2xl hover:scale-[1.02] transition-all disabled:opacity-70 disabled:scale-100 flex items-center gap-3 mx-auto"
                                >
                                    {isAiLoading ? (
                                        <><i className="fas fa-circle-notch fa-spin"></i> Анализируем данные...</>
                                    ) : (
                                        <><i className="fas fa-wand-magic-sparkles"></i> Получить расшифровку AI</>
                                    )}
                                </button>
                                <p className="text-xs text-slate-400 mt-2">
                                    ИИ проанализирует сочетание результатов всех тестов и даст персонализированные рекомендации.
                                </p>
                            </>
                        )}
                    </div>
                )}
              </div>

              {/* Action Buttons Grid - Replaced Flex Row for Better Mobile/Tablet Layout */}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 pt-4 no-print">
                {!isSharedView && (
                    <button
                    onClick={handleEditAnswers}
                    className="py-4 rounded-xl border border-white/60 bg-white/40 backdrop-blur-sm text-slate-600 font-bold hover:bg-white/80 transition-all text-sm shadow-sm hover:shadow-md"
                    >
                    <i className="fas fa-edit mr-2"></i> Уточнить ответы
                    </button>
                )}
                
                {/* Share Result Link Button (Client -> Therapist) */}
                <button
                  onClick={handleShareResults}
                  className="py-4 rounded-xl border border-[#4A6D7C]/30 bg-[#4A6D7C]/10 backdrop-blur-sm text-[#4A6D7C] font-bold hover:bg-[#4A6D7C]/20 transition-all text-sm shadow-sm hover:shadow-md"
                >
                  <i className="fas fa-share-square mr-2"></i> Ссылка на результат
                </button>

                <button
                  onClick={() => {
                    const text = `Результаты диагностики Клиника Диалектика:\n\n${results.map(r => `${r.testName}: ${r.interpretation}`).join('\n')}\n\n${aiInterpretation ? `Рекомендации:\n${aiInterpretation}` : ''}`;
                    navigator.clipboard.writeText(text);
                    alert('Результаты скопированы в буфер обмена!');
                  }}
                  className="py-4 rounded-xl border border-white/60 bg-white/40 backdrop-blur-sm text-slate-600 font-bold hover:bg-white/80 transition-all text-sm shadow-sm hover:shadow-md"
                >
                  <i className="fas fa-copy mr-2"></i> Текст отчета
                </button>
                <button
                  onClick={handleDownloadPdf}
                  disabled={isGeneratingPdf}
                  className="py-4 rounded-xl bg-slate-800 text-white font-bold hover:bg-slate-900 transition-colors shadow-lg shadow-slate-800/20 text-sm disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {isGeneratingPdf ? (
                    <span><i className="fas fa-spinner fa-spin mr-2"></i> Создание PDF...</span>
                  ) : (
                    <span><i className="fas fa-file-pdf mr-2"></i> Скачать PDF</span>
                  )}
                </button>
              </div>

              {/* Secondary CTA Button Area - Duplicated here */}
              <div className="flex justify-center pt-2 pb-6 no-print">
                 <AppointmentButton />
              </div>

              <div className="bg-white/40 backdrop-blur-md rounded-3xl p-8 border border-white/60 text-center space-y-5 shadow-sm">
                 <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center text-[#4A6D7C] mx-auto shadow-sm border border-slate-100">
                   <i className="fas fa-shield-alt text-xl"></i>
                 </div>
                 <div>
                   <h4 className="font-bold text-slate-900 mb-2 text-lg">Дисклеймер</h4>
                   <p className="text-sm text-slate-600 leading-relaxed max-w-2xl mx-auto">
                     Данный отчет сформирован автоматически на основе ваших ответов. Результаты не являются окончательным медицинским диагнозом. Для точной интерпретации и назначения лечения необходима консультация специалиста <strong className="text-[#4A6D7C]">Клиники «Диалектика»</strong>.
                   </p>
                 </div>
                 
                 <div className="pt-6">
                   <button 
                     onClick={handleGoHome}
                     className="text-slate-400 hover:text-[#4A6D7C] text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 mx-auto transition-colors"
                   >
                     <i className="fas fa-redo"></i> Начать новую диагностику
                   </button>
                 </div>
              </div>
            </div>
          )}
        </div>
      </div>
      
      <div className="mt-8 text-center no-print">
         <p className="text-xs text-slate-400 font-medium">Клиника Диалектика &copy; 2026</p>
      </div>
    </div>
  );
}