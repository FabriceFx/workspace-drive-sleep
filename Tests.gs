/**
 * @fileoverview Suite de tests unitaires et d'intégration pour Drive Sleep & Green FinOps.
 * Exécuter `runAllTests()` depuis l'éditeur Apps Script ou le menu personnalisé.
 */

function runAllTests() {
  const tests = [
    test_CA01_initialisationFeuilles,
    test_CA02_filtrageFichierBinaireDormant,
    test_CA02_exclusionListeBlancheEtFichiersRecents,
    test_CA03_echappementHtmlSecurite,
    test_CA04_calculKpiTableauDeBord
  ];

  let reussis = 0;
  let echoues = 0;
  const details = [];

  tests.forEach((fnTest) => {
    try {
      fnTest();
      reussis++;
      details.push(`✅ ${fnTest.name} : OK`);
      console.info(`✅ ${fnTest.name} : OK`);
    } catch (erreur) {
      echoues++;
      details.push(`❌ ${fnTest.name} : ${erreur.message}`);
      console.error(`❌ ${fnTest.name} :`, erreur.message);
    }
  });

  const bilan = `Tests terminés : ${reussis} réussi(s), ${echoues} échoué(s).`;
  console.info(bilan);
  if (SpreadsheetApp.getActiveSpreadsheet()) {
    SpreadsheetApp.getActiveSpreadsheet().toast(bilan, '🧪 Tests unitaires', 8);
  }
  return { reussis, echoues, details };
}

function affirmer_(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function test_CA01_initialisationFeuilles() {
  initialiserEnvironnement();
  const classeur = obtenirClasseurMaitre_();
  Object.values(NOMS_FEUILLES).forEach((nom) => {
    const feuille = classeur.getSheetByName(nom);
    affirmer_(Boolean(feuille), `La feuille ${nom} devrait exister après initialisation.`);
  });
}

function test_CA02_filtrageFichierBinaireDormant() {
  const config = { ...CONFIGURATION_PAR_DEFAUT, SEUIL_INACTIVITE_MOIS: 12, TAILLE_MIN_MO: 5 };
  const dateLimite = new Date('2025-10-01T00:00:00Z');
  const idsExclus = new Set();

  const fauxFichier = {
    id: 'file_123',
    name: 'Archive_2023.zip',
    mimeType: 'application/zip',
    size: String(20 * 1024 * 1024),
    modifiedTime: '2024-01-15T10:00:00Z',
    viewedByMeTime: '2024-02-01T10:00:00Z',
    owners: [{ emailAddress: 'test@exemple.fr' }]
  };

  const resultat = evaluerEligibiliteFichier_(fauxFichier, config, dateLimite, idsExclus);
  affirmer_(resultat !== null, 'Le fichier binaire dormant de 20 Mo aurait dû être retenu.');
  affirmer_(resultat.tailleMo === 20, `Taille attendue 20 Mo, obtenue : ${resultat.tailleMo}`);
}

function test_CA02_exclusionListeBlancheEtFichiersRecents() {
  const config = { ...CONFIGURATION_PAR_DEFAUT, SEUIL_INACTIVITE_MOIS: 12, TAILLE_MIN_MO: 5 };
  const dateLimite = new Date('2025-10-01T00:00:00Z');
  const idsExclus = new Set(['id_protege']);

  const fichierProtege = {
    id: 'id_protege',
    name: 'Statuts.pdf',
    mimeType: 'application/pdf',
    size: String(50 * 1024 * 1024),
    modifiedTime: '2022-01-01T00:00:00Z'
  };
  affirmer_(evaluerEligibiliteFichier_(fichierProtege, config, dateLimite, idsExclus) === null, 'Le fichier en liste blanche doit être ignoré.');

  const fichierTropPetit = {
    id: 'id_petit',
    name: 'note.txt',
    mimeType: 'text/plain',
    size: String(100 * 1024),
    modifiedTime: '2022-01-01T00:00:00Z'
  };
  affirmer_(evaluerEligibiliteFichier_(fichierTropPetit, config, dateLimite, idsExclus) === null, 'Le fichier binaire inférieur à 5 Mo doit être ignoré.');
}

function test_CA03_echappementHtmlSecurite() {
  const brut = '<script>alert("xss")</script>';
  const echappe = echapperHtml_(brut);
  affirmer_(!echappe.includes('<script>'), 'Les balises HTML doivent être échappées.');
}

function test_CA04_calculKpiTableauDeBord() {
  const kpi = mettreAJourTableauDeBord();
  affirmer_(typeof kpi.goLiberes === 'number' && !Number.isNaN(kpi.goLiberes), 'Le KPI goLiberes doit être un nombre valide.');
  affirmer_(typeof kpi.co2EviteKg === 'number' && !Number.isNaN(kpi.co2EviteKg), 'Le KPI co2EviteKg doit être un nombre valide.');
}
