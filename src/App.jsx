import React, { useState, useRef, useEffect } from 'react';
import './App.css';
import SyllabusTemplate from './SyllabusTemplate';
import { Listbox } from '@headlessui/react';
import logo from './assets/Logo_ECE_Paris2.png';
import { Analytics } from '@vercel/analytics/react';
// Importez la bibliothèque PDF.js
import * as pdfjsLib from 'pdfjs-dist';
// La ligne suivante est commentée pour être compatible avec Vercel
//import 'pdfjs-dist/build/pdf.worker.entry';

// Configure le worker PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

// Fonction pour extraire le texte d'un fichier PDF
const extractTextFromPDF = async (file) => {
  try {
    // Convertir le fichier en ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();
    // Charger le document PDF
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';
    
    // Extraire le texte de chaque page
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str).join(' ');
      fullText += pageText + '\n\n';
    }
    
    return fullText;
  } catch (error) {
    console.error('Erreur lors de l\'extraction du texte PDF:', error);
    return `Erreur d'extraction du PDF ${file.name}: ${error.message}`;
  }
};

const ChatMessage = ({ message, isUser }) => (
  <div className={`chat-message ${isUser ? 'user' : 'ai'} mb-4 animate-fade-in`}>
    <p>{message}</p>
  </div>
);

const App = () => {
  const apiKey = import.meta.env.VITE_REACT_APP_API_KEY;
  console.log('API Key:', apiKey ? 'Définie' : 'Non définie');
  const [messages, setMessages] = useState([
    {text: "Bienvenue sur TOQ ! Ravi de vous revoir. Importez vos PDF pour générer un syllabus.", isUser:false}
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
  const [pdfContents, setPdfContents] = useState([]); // Stocker le contenu des PDF
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

  useEffect(() => {
    scrollToBottom();
  }, [messages, syllabus]);

  // Fonction pour identifier le thème à partir des contenus PDF
  const identifyThemeFromPDF = async (pdfContents) => {
    try {
      // Préparer le contenu des PDF pour l'envoyer à l'API
      const pdfContentsText = pdfContents.map(pdf => 
        `Fichier: ${pdf.name}\nContenu:\n${pdf.content}`
      ).join('\n\n-----\n\n');
  
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
            content: `Voici le contenu de plusieurs documents PDF. Identifie le thème principal qui pourrait être utilisé pour créer un syllabus de cours. Réponds uniquement avec le thème identifié, sans phrases additionnelles ni explications.
            
            CONTENU DES FICHIERS PDF FOURNIS:
            ${pdfContentsText}`
          }],
          temperature: 0.3
        }),
      });
  
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || 'Erreur API');
  
      const theme = data.choices[0].message.content.trim();
      return theme;
    } catch (error) {
      console.error('Erreur lors de l\'identification du thème:', error);
      return "Thème non identifié";
    }
  };

  // Fonction modifiée pour générer le syllabus
  const generateSyllabus = async (distributionMode) => {
    try {
      setPdfDistributionMode(distributionMode);
      setMessages(prev => [...prev,
        { text: "Génération de(s) syllabus en cours...", isUser: false }
      ]);
  
      // Préparer le contenu des PDF pour l'envoyer à l'API
      const pdfContentsText = pdfContents.map(pdf => 
        `Fichier: ${pdf.name}\nContenu:\n${pdf.content}`
      ).join('\n\n-----\n\n');
  
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
            content: `Thème identifié : ${currentTheme}
            Nombre de syllabus demandé : ${requestedSyllabusCount}
            Distribution demandée : ${distributionMode}
            
            CONTENU DES FICHIERS PDF FOURNIS:
            ${pdfContentsText}
            
            Sur base du contenu des PDF fournis ci-dessus, génère exactement ${requestedSyllabusCount} syllabus détaillé sur le thème "${currentTheme}" selon cette distribution. Extrais tous les concepts, définitions et informations pertinentes des PDF pour créer un syllabus complet et approfondi.
            
            Pour chaque syllabus, utilise ce format:
            
            **Nom du Cours** : (Nom précis basé sur le contenu PDF)
            **Semestre** : (Suggestion basée sur le contenu)
            **Crédits ECTS** : (Suggestion appropriée)
            **Nombre d'heures dispensées** : (Suggestion basée sur le contenu)
            **Cours Magistraux** : (Heures suggérées)
            **Travaux Dirigés** : (Heures suggérées)
            **Travaux Pratiques** : (Heures suggérées)
            **Projets** : (Description des projets possibles basés sur le contenu)
            **Enseignant référent** : (Si non spécifié dans le PDF, suggérer "Professeur de chimie/physique")
            **Equipe d'enseignants** : (Si non spécifié, suggestion générique)
            **Modalité pédagogique** : (Suggestion appropriée)
            **Langue** : (Langue du document)
            **Objectifs pédagogiques** : (Objectifs détaillés extraits du contenu du PDF)
            **Pré requis** : (Prérequis identifiés d'après le document)
            **Contenu** : (Contenu détaillé du cours structuré à partir des informations du PDF)
            **Compétences à acquérir** : (Compétences précises développées par les étudiants)
            **Modalités d'évaluation** : (Méthodes d'évaluation adaptées)
            **Références externes** : (Références pertinentes)
            
            ---
            `
          }],
          temperature: 0.7
        }),
      });
  
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || 'Erreur API');
  
      const aiResponse = data.choices[0].message.content;
      const syllabusArray = aiResponse.split('---').filter(Boolean);
  
      // Réinitialiser la liste des syllabus
      setSyllabusList([]);
      
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
  
      setAwaitingSyllabusCount(false);
      setAwaitingDistributionMode(false);
      setPdfDistributionMode(null);
      
    } catch (error) {
      console.error('Erreur:', error);
      setMessages(prev => [...prev, { text: `Erreur lors de la génération: ${error.message}`, isUser: false }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim() && !selectedFiles.length && isLoading) return;

    setIsLoading(true);
    const userMessage = input;
    setInput('');

    // Ajouter le message utilisateur
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
    
      if (count === 1) {
        // Si un seul syllabus est demandé, passer directement à la génération
        await generateSyllabus("standard");
      } else {
        setAwaitingDistributionMode(true);
        setMessages(prev => [...prev, {
          text: "Comment souhaitez-vous répartir le contenu dans les syllabus ?",
          isUser: false
        }]);
        setIsLoading(false);
      }
      return;
    }

    // Si on attend le mode de distribution
    if (awaitingDistributionMode) {
      try {
        setAwaitingDistributionMode(false);
        setPdfDistributionMode(userMessage);
        
        // Appeler la fonction de génération avec le mode de distribution
        await generateSyllabus(userMessage);
      } catch (error) {
        console.error('Erreur:', error);
        setMessages(prev => [...prev, { text: `Erreur: ${error.message}`, isUser: false }]);
        setIsLoading(false);
      }
      return;
    }

    // Pour toute nouvelle entrée (texte libre)
    setMessages(prev => [...prev, {
      text: "Combien de syllabus souhaitez-vous générer ?",
      isUser: false
    }]);
    setAwaitingSyllabusCount(true);
    setIsLoading(false);
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
    // Ne pas réinitialiser currentTheme car il est maintenant déterminé par les PDF
    
    // Réinitialiser la liste des syllabus
    setSyllabusList([]);
    setGenerated(false);
  };

  // Fonction modifiée pour extraire le contenu des PDF et identifier le thème
  const handleFileChange = async (event) => {
    const files = Array.from(event.target.files);
    const pdfFiles = files.filter(file => file.type === 'application/pdf');
    
    if (pdfFiles.length > 0) {
      setIsLoading(true);
      setMessages(prev => [...prev, {
        text: `Chargement de ${pdfFiles.length} fichier(s) PDF en cours...`,
        isUser: true
      }]);
      
      setSelectedFiles(pdfFiles);
      
      // Extraire le contenu des PDF
      const extractedContents = [];
      for (const file of pdfFiles) {
        try {
          const content = await extractTextFromPDF(file);
          extractedContents.push({ name: file.name, content });
        } catch (error) {
          console.error(`Erreur lors de l'extraction du PDF ${file.name}:`, error);
          setMessages(prev => [...prev, {
            text: `Erreur lors de l'extraction du PDF ${file.name}: ${error.message}`,
            isUser: false
          }]);
        }
      }
      
      setPdfContents(extractedContents);
      
      // Identifier le thème à partir des PDF
      setMessages(prev => [...prev, {
        text: `Analyse du contenu des PDF pour identifier le thème...`,
        isUser: false
      }]);
      
      const theme = await identifyThemeFromPDF(extractedContents);
      setCurrentTheme(theme);
      
      // Message de confirmation avec le thème détecté
      setMessages(prev => [...prev, {
        text: `${pdfFiles.length} fichier(s) PDF analysé(s) avec succès. Le thème identifié est : "${theme}". Combien de syllabus souhaitez-vous générer ?`,
        isUser: false
      }]);
      
      // Demander directement le nombre de syllabus
      setAwaitingSyllabusCount(true);
      resetStates();
      setAwaitingSyllabusCount(true); // Réactiver car resetStates() le désactive
      
      setIsLoading(false);
    }
  };

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
                placeholder="Entrez vos instructions..."
                className="flex-1 p-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
                disabled={isLoading}
              />
              <button
                type="submit"
                disabled={isLoading}
                className={`px-6 py-3 rounded-lg font-medium transition-all duration-200 ${isLoading ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'} text-white`}
              >
                {isLoading ? 'Chargement...' : 'Envoyer'}
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