import React, { useState, useRef, useEffect } from 'react';
import './App.css';
import SyllabusTemplate from './SyllabusTemplate';
import { Listbox } from '@headlessui/react';
import logo from './assets/Logo_ECE_Paris2.png';
import { Analytics } from '@vercel/analytics/react';
import * as pdfjsLib from 'pdfjs-dist/build/pdf';
import { GlobalWorkerOptions } from 'pdfjs-dist/build/pdf';
GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

const ChatMessage = ({ message, isUser }) => (
  <div className={`chat-message ${isUser ? 'user' : 'ai'} mb-4 animate-fade-in`}>
    <p>{message}</p>
  </div>
);

const App = () => {
  const apiKey = import.meta.env.VITE_REACT_APP_API_KEY;
  console.log('API Key:', apiKey ? 'Définie' : 'Non définie');
  const [messages, setMessages] = useState([
    { text: "Bienvenue sur TOQ ! Ravi de vous revoir. Sur quel sujet souhaitez-vous créer votre syllabus aujourd’hui ?", isUser: false }
  ]);
  const [input, setInput] = useState('');
  const [syllabus, setSyllabus] = useState({
    courseName: '',
    semester: '',
    ectsCredits: '',
    hours: '',
    lectures: '',
    tutorials: '',
    practicals: '',
    projects: '',
    mainTeacher: '',
    teachingTeam: '',
    teachingMethod: '',
    language: '',
    objectives: '',
    prerequisites: '',
    content: '',
    skills: '',
    evaluation: '',
    references: ''
  });
  const [isLoading, setIsLoading] = useState(false);
  const [generated, setGenerated] = useState(false);
  const messagesEndRef = useRef(null);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const fileInputRef = useRef(null);
  const [awaitingSyllabusCount, setAwaitingSyllabusCount] = useState(false);
  const [pdfDistributionMode, setPdfDistributionMode] = useState("standard");
  const [syllabusList, setSyllabusList] = useState([]);
  const [currentSyllabusIndex, setCurrentSyllabusIndex] = useState(0);
  const [awaitingDistributionMode, setAwaitingDistributionMode] = useState(false);
  const [requestedSyllabusCount, setRequestedSyllabusCount] = useState(null);
  const [currentTheme, setCurrentTheme] = useState('');

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const loadPdfText = async (file) => {
    const loadingTask = pdfjsLib.getDocument(URL.createObjectURL(file));
    const pdf = await loadingTask.promise;
    const textContent = [];

    // Limiter le nombre de pages à traiter si le PDF est très long
    const maxPages = Math.min(pdf.numPages, 10); // Traiter max 10 pages par PDF

    for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const text = await page.getTextContent();
      textContent.push(text.items.map(item => item.str).join(' '));
    }

    // Limiter la taille du texte extrait (environ 1000 tokens par PDF)
    const combinedText = textContent.join('\n');
    return combinedText.length > 4000 ? combinedText.substring(0, 4000) + "... [contenu tronqué]" : combinedText;
  };

  const summarizePdfContent = (pdfContent, maxLength = 1000) => {
    if (!pdfContent || pdfContent.length <= maxLength) return pdfContent;

    // Extraire les sections importantes (titres, en-têtes, etc.)
    const importantSections = pdfContent.split('\n')
      .filter(line => {
        const trimmed = line.trim();
        return trimmed.length > 0 &&
          (trimmed.endsWith(':') ||
            /^[A-Z]/.test(trimmed) ||
            trimmed.length < 100);
      })
      .join('\n');

    // Si même les sections importantes sont trop longues, tronquer
    if (importantSections.length > maxLength) {
      return importantSections.substring(0, maxLength) + "... [contenu résumé]";
    }

    return importantSections;
  };

  const extractPdfTitle = async (file) => {
    const pdf = await pdfjsLib.getDocument(URL.createObjectURL(file)).promise;
    const metadata = await pdf.getMetadata();
    return metadata.info.Title || file.name;
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, syllabus]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    setIsLoading(true);
    const userMessage = input;
    setInput('');

    // Pour toute nouvelle entrée (nouveau thème)

    if (!awaitingSyllabusCount && !awaitingDistributionMode) {
      // Réinitialiser uniquement les états du processus
      resetStates();
      // Sauvegarder le nouveau thème
      setCurrentTheme(userMessage);
      // Ajouter le message utilisateur aux messages existants
      setMessages(prev => [...prev,
      { text: userMessage, isUser: true },
      { text: "Combien de syllabus souhaitez-vous générer ?", isUser: false }
      ]);
      setAwaitingSyllabusCount(true);
      setIsLoading(false);
      return;
    }

    // Ajouter le message utilisateur pour les autres cas
    setMessages(prev => [...prev, { text: userMessage, isUser: true }]);

    // Si on attend la réponse pour le nombre de syllabus
    if (awaitingSyllabusCount) {
      const count = parseInt(userMessage);
      if (isNaN(count) || count <= 0) {
        setMessages(prev => [...prev, {
          text: "Veuillez entrer un nombre valide supérieur à 0.",
          isUser: false
        }]);
        setIsLoading(false);
        return;
      }

      setRequestedSyllabusCount(count);
      setAwaitingSyllabusCount(false);
      setAwaitingDistributionMode(true);
      if (count === 1) {
        setMessages(prev => [...prev, {
          text: `Souhaitez-vous générer un seul syllabus pour le thème : ${currentTheme} ?`,
          isUser: false
        }]);
        setIsLoading(false);
        return;
      } else {
        setMessages(prev => [...prev, {
          text: "Comment souhaitez-vous répartir le contenu dans les syllabus ?",
          isUser: false
        }]);
        setIsLoading(false);
        return;
      }
    }

    // Si on attend le mode de distribution
    if (awaitingDistributionMode) {
      try {
        setAwaitingDistributionMode(false);
        setPdfDistributionMode(userMessage);

        setMessages(prev => [...prev,
        { text: "Génération de(s) syllabus en cours...", isUser: false }
        ]);

        //récupérer le contenu des pdf (pas seulement le nom) dans une variable
        const pdfContent = await Promise.all(selectedFiles.map(async file => {
          const content = await loadPdfText(file);
          return {
            name: file.name,
            summary: summarizePdfContent(content)
          };
        }));

        // Préparer un résumé concis des PDF pour l'API
        const pdfSummaries = pdfContent.map(pdf =>
          `Fichier: ${pdf.name}\nRésumé: ${pdf.summary}`
        ).join('\n\n');

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: "gpt-4",
            messages: [{
              role: "user",
              content: `Thème demandé : ${currentTheme}
              Nombre de syllabus demandé : ${requestedSyllabusCount}
              Distribution demandée : ${userMessage}
              Fichiers PDF fournis : ${selectedFiles.map(f => f.name).join(', ')}
              Informations extraites des PDF : ${pdfSummaries}
              Génère exactement ${requestedSyllabusCount} syllabus sur le thème "${currentTheme}" selon cette distribution. Pour chaque syllabus, utilise ce format :
              
              **Nom du Cours** : ...
              **Semestre** : ...
              **Crédits ECTS** : ...
              **Nombre d'heures dispensées** : ...
              **Cours Magistraux** : ...
              **Travaux Dirigés** : ...
              **Travaux Pratiques** : ...
              **Projets** : ...
              **Enseignant référent** : ...
              **Equipe d'enseignants** : ...
              **Modalité pédagogique** : ...
              **Langue** : ...
              **Objectifs pédagogiques** : ...
              **Pré requis** : ...
              **Contenu** : ...
              **Compétences à acquérir** : ...
              **Modalités d'évaluation** : ...
              **Références externes** : ...
              
              ---
              `
            }],
            temperature: 0.7
          }),
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message || 'Erreur API');

        const aiResponse = data.choices[0].message.content;
        // Séparer les syllabus si plusieurs sont générés
        const syllabusArray = aiResponse.split('---').filter(Boolean);

        syllabusArray.forEach((syllabusText, index) => {
          const newSyllabus = parseSyllabus(syllabusText);
          setSyllabusList(prev => [...prev, newSyllabus]);
          if (index === 0) {
            setSyllabus(newSyllabus);
          }
          setGenerated(true);
        });

        setMessages(prev => [...prev,
        { text: `${syllabusArray.length} syllabus ont été générés !`, isUser: false }
        ]);

        setMessages(prev => [...prev,
        { text: `Sur quel autre sujet souhaitez-vous créer votre syllabus ?`, isUser: false }
        ]);

        // Après la génération réussie, réinitialiser les états pour la prochaine entrée
        setAwaitingSyllabusCount(false);
        setAwaitingDistributionMode(false);
        setPdfDistributionMode(null);

      } catch (error) {
        console.error('Erreur:', error);
        setMessages(prev => [...prev, { text: "Erreur lors de la génération.", isUser: false }]);
      } finally {
        setIsLoading(false);
      }
      return;
    }

    // Pour toute nouvelle entrée (nouveau thème)
    if (!awaitingSyllabusCount && !awaitingDistributionMode) {
      // Réinitialiser les états
      resetStates();

      // Poser la question pour le nombre de syllabus
      setMessages(prev => [...prev, {
        text: "Combien de syllabus souhaitez-vous générer ?",
        isUser: false
      }]);
      setAwaitingSyllabusCount(true);
      setIsLoading(false);
      return;
    }
  };

  const parseSyllabus = (text) => {
    console.log('Text to parse:', text);
    // Nettoyer le texte des espaces supplémentaires
    text = text.trim();

    const patterns = {
      courseName: /\*\*Nom du Cours\*\* *: *([^\n]+)/,
      semester: /\*\*Semestre\*\* *: *([^\n]+)/,
      ectsCredits: /\*\*Crédits ECTS\*\* *: *([^\n]+)/,
      hours: /\*\*Nombre d'heures dispensées\*\* *: *([^\n]+)/,
      lectures: /\*\*Cours Magistraux\*\* *: *([^\n]+)/,
      tutorials: /\*\*Travaux Dirigés\*\* *: *([^\n]+)/,
      practicals: /\*\*Travaux Pratiques\*\* *: *([^\n]+)/,
      projects: /\*\*Projets\*\* *: *([^\n]+)/,
      mainTeacher: /\*\*Enseignant référent\*\* *: *([^\n]+)/,
      teachingTeam: /\*\*Equipe d'enseignants\*\* *: *([^\n]+)/,
      teachingMethod: /\*\*Modalité pédagogique\*\* *: *([^\n]+)/,
      language: /\*\*Langue\*\* *: *([^\n]+)/,
      objectives: /\*\*Objectifs pédagogiques\*\* *: *([\s\S]*?)(?=\*\*|$)/,
      prerequisites: /\*\*Pré requis\*\* *: *([\s\S]*?)(?=\*\*|$)/,
      content: /\*\*Contenu\*\* *: *([\s\S]*?)(?=\*\*|$)/,
      skills: /\*\*Compétences à acquérir\*\* *: *([\s\S]*?)(?=\*\*|$)/,
      evaluation: /\*\*Modalités d'évaluation\*\* *: *([\s\S]*?)(?=\*\*|$)/,
      references: /\*\*Références externes\*\* *: *([\s\S]*?)(?=\*\*|$)/
    };

    const syllabus = {};

    for (const [key, pattern] of Object.entries(patterns)) {
      const match = text.match(pattern);
      if (match && match[1]) {
        syllabus[key] = match[1].trim();
      } else {
        console.warn(`No match found for ${key} in:`, text);
        syllabus[key] = 'Non spécifié';
      }
    }

    return syllabus;
  };

  const handleSyllabusChange = (field, value) => {
    setSyllabus(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const resetStates = () => {
    // Réinitialiser uniquement les états du processus de génération
    setAwaitingSyllabusCount(false);
    setAwaitingDistributionMode(false);
    setPdfDistributionMode(null);
    setRequestedSyllabusCount(null);
    setCurrentTheme('');

  };

  // Modifier le handleFileChange existant
  const handleFileChange = async (event) => {
    const files = Array.from(event.target.files);
    const pdfFiles = files.filter(file => file.type === 'application/pdf');
    setSelectedFiles(pdfFiles);
    resetStates();

    if (pdfFiles.length > 0) {
      const pdfTitles = await Promise.all(pdfFiles.map(file => extractPdfTitle(file)));
      const theme = pdfTitles.join(', ');
      setCurrentTheme(theme);
      setMessages(prev => [...prev, {
        text: `${pdfFiles.length} fichier(s) PDF sélectionné(s) : ${pdfFiles.map(f => f.name).join(', ')}`,
        isUser: true
      }, {
        text: "Combien de syllabus souhaitez-vous générer ?",
        isUser: false
      }]);
      setAwaitingSyllabusCount(true);
    }
  };

  // Ajouter un useEffect pour réinitialiser les états quand l'input change
  useEffect(() => {
    if (input.trim() !== '') {

    }
  }, [input]);

  useEffect(() => {
    if (syllabusList.length > 0) {
      setCurrentSyllabusIndex(syllabusList.length - 1);
      setSyllabus(syllabusList[syllabusList.length - 1]);
    }
  }, [syllabusList]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-600 relative">
      {/* Logo */}
      <div className="absolute top-4 left-4 z-20">
        {/* <img
          src={logo}
          alt="Logo"
          className="w-0.1 h-0.1 object-contain"
        /> */}
      </div>

      {/* Conteneur principal */}
      <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-600 flex items-center justify-center p-4 pt-24">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl flex overflow-hidden">
          {/* Chatbot Section */}
          <div className="w-full md:w-1/2 p-6 flex flex-col transition-all duration-500">
            <h1 className="text-3xl font-bold text-gray-800 mb-4 text-center">TOQ : Votre générateur de syllabus</h1>
            <div className="chatbot-container h-[65vh] overflow-y-auto pr-4 flex flex-col space-y-4">
              {messages.map((message, index) => (
                <ChatMessage key={index} message={message.text} isUser={message.isUser} />
              ))}
              <div ref={messagesEndRef} />
            </div>
            <form onSubmit={handleSubmit} className="mt-4 flex gap-2 items-center">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".pdf"
                multiple
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current.click()}
                className="min-w-[44px] h-[44px] flex items-center justify-center rounded-lg bg-gray-200 hover:bg-gray-300 transition-all duration-200"
                title="Joindre des PDF"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5 text-gray-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                  />
                </svg>
              </button>
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Demandez un syllabus sur ..."
                className="flex-1 p-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
                disabled={isLoading}
              />
              <button
                type="submit"
                disabled={isLoading}
                className={`px-6 py-3 rounded-lg font-medium transition-all duration-200 ${isLoading ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'} text-white`}
              >
                {isLoading ? 'Chargement...' : 'Générer'}
              </button>
            </form>
          </div>

          {/* Syllabus Section */}
          <div className={`w-full md:w-1/2 p-6 bg-gray-100 syllabus-container overflow-y-auto animate-fade-in ${generated ? 'block' : 'hidden'}`}>
            <h2 className="text-2xl font-bold text-gray-300 mb-4">Syllabus Généré</h2>
            {syllabusList.length > 1 && (
              <div className="mb-4 relative w-20">
                <Listbox
                  value={currentSyllabusIndex}
                  onChange={(index) => {
                    setCurrentSyllabusIndex(index);
                    setSyllabus(syllabusList[index]);
                  }}
                >
                  <Listbox.Button className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 bg-white text-gray-600 cursor-pointer hover:border-blue-500 transition-all duration-200 flex justify-between items-center">
                    <span className="text-white">Syllabus {currentSyllabusIndex + 1}</span>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-4 w-4 text-gray-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      width="40"
                      height="40"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </Listbox.Button>
                  <Listbox.Options className="absolute w-full mt-1 bg-white border rounded-lg shadow-lg max-h-60 overflow-auto z-10">
                    {syllabusList.map((_, index) => (
                      <Listbox.Option
                        key={index}
                        value={index}
                        className={({ active }) =>
                          `p-3 text-sm cursor-pointer text-white ${active ? 'bg-blue-600' : 'bg-gray-700'}`
                        }
                      >
                        Syllabus {index + 1}
                      </Listbox.Option>
                    ))}
                  </Listbox.Options>
                </Listbox>
              </div>
            )}
            <SyllabusTemplate
              syllabus={syllabus}
              onChange={handleSyllabusChange}
            />
          </div>
        </div>
      </div>
      <Analytics />
    </div>
  );
};

export default App;