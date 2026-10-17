/**
 * @fileoverview Suite de tests unitaires et d'intégration pour Drive Sleep & Green FinOps.
 * Exécuter `runAllTests()` depuis l'éditeur Apps Script ou le menu personnalisé.
 * Projet : Drive Sleep & Green FinOps (workspace-drive-sleep)
 * Auteur : Fabrice Faucheux (FF Labs - faucheux.bzh)
 */

/**
 * Exécute l'ensemble des tests et affiche le bilan.
 * @returns {{reussis: number, echoues: number, details: string[]}}
 */
function runAllTests() {
  const tests = [
    test_CA01_initialisationFeuilles,
    test_CA02_filtrageFichierBinaireDormant,
    test_CA02_exclusionListeBlancheEtFichiersRecents,
    test_CA02_tailleReelleQuotaBytesUsed,
    test_CA02_natifSansQuotaUtilisePoidsEstime,
    test_CA03_echappementHtmlSecurite,
    test_CA03_formatageDateMailFr,
    test_CA04_calculKpiTableauDeBord,
    test_CA05_constantesColonnes,
    test_CA05_declencheursDistincts,
    test_CA06_retryBackoff,
    test_CA06_retryErreurDefinitive
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

/**
 * Lève une erreur si la condition est fausse.
 * @param {boolean} condition
 * @param {string} message
 */
function affirmer_(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const CONTEXTE_TEST_ = Object.freeze({ fuseau: 'Europe/Paris', emailParDefaut: 'defaut@exemple.fr' });

function test_CA01_initialisationFeuilles() {
  initialiserEnvironnement();
  const classeur = obtenirClasseurMaitre_();
  Object.values(NOMS_FEUILLES).forEach((nom) => {
    affirmer_(Boolean(classeur.getSheetByName(nom)), `La feuille ${nom} devrait exister après initialisation.`);
  });
}

function test_CA02_filtrageFichierBinaireDormant() {
  const config = { ...CONFIGURATION_PAR_DEFAUT, SEUIL_INACTIVITE_MOIS: 12, TAILLE_MIN_MO: 5 };
  const dateLimite = new Date('2025-10-01T00:00:00Z');
  const fauxFichier = {
    id: 'file_123',
    name: 'Archive_2023.zip',
    mimeType: 'application/zip',
    size: String(20 * 1024 * 1024),
    modifiedTime: '2024-01-15T10:00:00Z',
    viewedByMeTime: '2024-02-01T10:00:00Z',
    owners: [{ emailAddress: 'Test@Exemple.fr' }]
  };
  const resultat = evaluerEligibiliteFichier_(fauxFichier, config, dateLimite, new Set(), CONTEXTE_TEST_);
  affirmer_(resultat !== null, 'Le fichier binaire dormant de 20 Mo aurait dû être retenu.');
  affirmer_(resultat.tailleMo === 20, `Taille attendue 20 Mo, obtenue : ${resultat.tailleMo}`);
  affirmer_(resultat.derniereActiviteIso === '01/02/2024', `Date attendue 01/02/2024, obtenue : ${resultat.derniereActiviteIso}`);
  affirmer_(resultat.derniereActiviteDate instanceof Date, 'La date d\'activité doit être un objet Date pour la feuille.');
  affirmer_(resultat.proprietaire === 'test@exemple.fr', 'L\'adresse du propriétaire doit être normalisée en minuscules.');
}

function test_CA02_exclusionListeBlancheEtFichiersRecents() {
  const config = { ...CONFIGURATION_PAR_DEFAUT, SEUIL_INACTIVITE_MOIS: 12, TAILLE_MIN_MO: 5 };
  const dateLimite = new Date('2025-10-01T00:00:00Z');
  const idsExclus = new Set(['id_protege']);

  const fichierProtege = { id: 'id_protege', name: 'Statuts.pdf', mimeType: 'application/pdf', size: String(50 * 1024 * 1024), modifiedTime: '2022-01-01T00:00:00Z' };
  affirmer_(evaluerEligibiliteFichier_(fichierProtege, config, dateLimite, idsExclus, CONTEXTE_TEST_) === null, 'Le fichier en liste blanche doit être ignoré.');

  const fichierTropPetit = { id: 'id_petit', name: 'note.txt', mimeType: 'text/plain', size: String(100 * 1024), modifiedTime: '2022-01-01T00:00:00Z' };
  affirmer_(evaluerEligibiliteFichier_(fichierTropPetit, config, dateLimite, idsExclus, CONTEXTE_TEST_) === null, 'Le fichier binaire inférieur à 5 Mo doit être ignoré.');

  const fichierRecent = { id: 'id_recent', name: 'video.mp4', mimeType: 'video/mp4', size: String(500 * 1024 * 1024), modifiedTime: '2022-01-01T00:00:00Z', viewedByMeTime: '2026-01-01T00:00:00Z' };
  affirmer_(evaluerEligibiliteFichier_(fichierRecent, config, dateLimite, idsExclus, CONTEXTE_TEST_) === null, 'Un fichier consulté récemment doit être ignoré.');
}

function test_CA02_tailleReelleQuotaBytesUsed() {
  const config = { ...CONFIGURATION_PAR_DEFAUT };
  const dateLimite = new Date('2025-10-01T00:00:00Z');
  const fichier = { id: 'id_rev', name: 'plan.pdf', mimeType: 'application/pdf', size: String(4 * 1024 * 1024), quotaBytesUsed: String(12 * 1024 * 1024), modifiedTime: '2022-01-01T00:00:00Z' };
  const resultat = evaluerEligibiliteFichier_(fichier, config, dateLimite, new Set(), CONTEXTE_TEST_);
  affirmer_(resultat !== null && resultat.tailleMo === 12, 'quotaBytesUsed (révisions comprises) doit primer sur size.');
}

function test_CA02_natifSansQuotaUtilisePoidsEstime() {
  const config = { ...CONFIGURATION_PAR_DEFAUT, POIDS_ESTIME_NATIF_MO: 2 };
  const dateLimite = new Date('2025-10-01T00:00:00Z');
  const natif = { id: 'id_doc', name: 'Compte rendu', mimeType: 'application/vnd.google-apps.document', modifiedTime: '2022-01-01T00:00:00Z' };
  const resultat = evaluerEligibiliteFichier_(natif, config, dateLimite, new Set(), CONTEXTE_TEST_);
  affirmer_(resultat !== null && resultat.tailleMo === 2, 'Un natif sans quotaBytesUsed doit utiliser le poids estimé.');
  affirmer_(resultat.proprietaire === 'defaut@exemple.fr', 'Sans propriétaire renvoyé, l\'adresse par défaut du contexte doit être utilisée.');
}

function test_CA03_echappementHtmlSecurite() {
  const echappe = echapperHtml_('<script>alert("xss")</script>');
  affirmer_(!echappe.includes('<script>'), 'Les balises HTML doivent être échappées.');
}

function test_CA03_formatageDateMailFr() {
  const objetDate = new Date(2024, 0, 15, 12, 0, 0);
  affirmer_(formaterDateFr_(objetDate) === '15/01/2024', `Attendu 15/01/2024 pour Date, obtenu : ${formaterDateFr_(objetDate)}`);
  affirmer_(formaterDateFr_('2024-01-15') === '15/01/2024', `Attendu 15/01/2024 pour chaîne ISO, obtenu : ${formaterDateFr_('2024-01-15')}`);
  affirmer_(formaterDateFr_('15/01/2024') === '15/01/2024', `Attendu 15/01/2024 pour chaîne FR, obtenu : ${formaterDateFr_('15/01/2024')}`);
}

function test_CA04_calculKpiTableauDeBord() {
  const kpi = mettreAJourTableauDeBord();
  affirmer_(typeof kpi.goLiberes === 'number' && !Number.isNaN(kpi.goLiberes), 'Le KPI goLiberes doit être un nombre valide.');
  affirmer_(typeof kpi.co2EviteKg === 'number' && !Number.isNaN(kpi.co2EviteKg), 'Le KPI co2EviteKg doit être un nombre valide.');
}

function test_CA05_constantesColonnes() {
  affirmer_(typeof COLONNES_INVENTAIRE.ID === 'number', 'COLONNES_INVENTAIRE.ID doit être défini');
  affirmer_(COLONNES_INVENTAIRE.DATE_TRAITEMENT === COLONNES_INVENTAIRE.STATUT + 1, 'Statut et Date_Traitement doivent être adjacents (écriture groupée).');
  affirmer_(typeof COLONNES_LISTE_BLANCHE.MOTIF === 'number', 'COLONNES_LISTE_BLANCHE.MOTIF doit être défini');
}

function test_CA05_declencheursDistincts() {
  affirmer_(FONCTIONS_DECLENCHEURS.REPRISE_AUDIT !== FONCTIONS_DECLENCHEURS.CAMPAGNE_MENSUELLE,
    'La reprise et la campagne mensuelle doivent cibler deux fonctions distinctes.');
  affirmer_(typeof reprendreAuditDrive === 'function' && typeof executerCampagneMensuelle === 'function',
    'Les fonctions cibles des déclencheurs doivent exister.');
}

function test_CA06_retryBackoff() {
  let compteur = 0;
  const resultat = executerAvecRetry_(() => {
    compteur++;
    if (compteur < 2) {
      throw new Error('429 Too Many Requests (simulation test)');
    }
    return 'succes';
  }, 3, 50);
  affirmer_(resultat === 'succes', 'executerAvecRetry_ doit réussir après un retry simulé');
  affirmer_(compteur === 2, `Deux tentatives attendues, obtenues : ${compteur}`);
}

function test_CA06_retryErreurDefinitive() {
  let compteur = 0;
  try {
    executerAvecRetry_(() => {
      compteur++;
      throw new Error('File not found: abc (simulation test, code 404)');
    }, 3, 10);
  } catch (erreur) {
    // attendu
  }
  affirmer_(compteur === 1, `Une erreur définitive ne doit pas être rejouée (tentatives : ${compteur}).`);
}
