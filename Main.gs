/**
 * @fileoverview Points d'entrée principaux (onOpen, doGet, déclencheurs et interface utilisateur).
 */

/**
 * Crée le menu personnalisé à l'ouverture du Google Sheet.
 * @param {GoogleAppsScript.Events.SheetsOnOpen} [e]
 */
function onOpen(e) {
  const langue = obtenirLangueUtilisateur_();
  const t = TEXTES_INTERFACE[langue];
  SpreadsheetApp.getUi()
    .createMenu(t.titreMenu)
    .addItem(t.menuInitialiser, 'actionMenuInitialiser')
    .addItem(t.menuAudit, 'actionMenuAudit')
    .addItem(t.menuNotifier, 'actionMenuNotifier')
    .addSeparator()
    .addItem(t.menuConsole, 'afficherConsoleNettoyage')
    .addItem(t.menuDeclencheur, 'installerDeclencheurMensuel')
    .addItem(t.menuTests, 'runAllTests')
    .addSeparator()
    .addItem(t.menuAPropos, 'afficherAPropos')
    .addToUi();
}

/**
 * Action du menu : initialise l'environnement et affiche un toast.
 */
function actionMenuInitialiser() {
  try {
    initialiserEnvironnement();
    SpreadsheetApp.getActiveSpreadsheet().toast('Les 4 feuilles sont prêtes / All 4 sheets are ready.', '🌱 Drive Sleep', 5);
  } catch (erreur) {
    console.error('Erreur actionMenuInitialiser :', erreur);
    SpreadsheetApp.getUi().alert('🌱 Erreur d\'initialisation', erreur.message, SpreadsheetApp.getUi().ButtonSet.OK);
  }
}

/**
 * Action du menu : lance l'audit Drive et affiche le résumé.
 */
function actionMenuAudit() {
  try {
    const resultat = lancerAuditDrive();
    const message = `Scannés : ${resultat.fichiersScannes} | Nouveaux dormants : ${resultat.fichiersRetenus}`;
    SpreadsheetApp.getActiveSpreadsheet().toast(message, '🌱 Audit Drive', 8);
  } catch (erreur) {
    console.error('Erreur actionMenuAudit :', erreur);
    SpreadsheetApp.getUi().alert('🌱 Erreur lors de l\'audit Drive', erreur.message, SpreadsheetApp.getUi().ButtonSet.OK);
  }
}

/**
 * Action du menu : envoie les notifications par e-mail.
 */
function actionMenuNotifier() {
  try {
    const resultat = envoyerNotificationsProprietaires();
    SpreadsheetApp.getActiveSpreadsheet().toast(`${resultat.emailsEnvoyes} bilan(s) envoyé(s).`, '🌱 Notifications', 5);
  } catch (erreur) {
    console.error('Erreur actionMenuNotifier :', erreur);
    SpreadsheetApp.getUi().alert('🌱 Erreur d\'envoi des notifications', erreur.message, SpreadsheetApp.getUi().ButtonSet.OK);
  }
}

/**
 * Ouvre la console de nettoyage en boîte de dialogue modale élégante dans Google Sheets.
 */
function afficherConsoleNettoyage() {
  try {
    const langue = obtenirLangueUtilisateur_();
    const t = TEXTES_INTERFACE[langue];
    const template = HtmlService.createTemplateFromFile('Ui');
    template.langueInitiale = langue;
    const html = template.evaluate()
      .setTitle(`🌱 ${t.titreConsole}`)
      .setWidth(880)
      .setHeight(680);
    SpreadsheetApp.getUi().showModalDialog(html, `🌱 ${t.titreConsole}`);
  } catch (erreur) {
    console.error('Erreur afficherConsoleNettoyage :', erreur);
    SpreadsheetApp.getUi().alert('🌱 Erreur', erreur.message, SpreadsheetApp.getUi().ButtonSet.OK);
  }
}

/**
 * Point d'entrée de la Web App pour permettre aux utilisateurs de trier leurs fichiers en plein écran.
 * @param {GoogleAppsScript.Events.DoGet} e
 * @returns {GoogleAppsScript.HTML.HtmlOutput}
 */
function doGet(e) {
  const langueParam = (e?.parameter?.lang || '').toLowerCase();
  const template = HtmlService.createTemplateFromFile('Ui');
  template.langueInitiale = (langueParam === 'en' || langueParam === 'fr') ? langueParam : obtenirLangueUtilisateur_();
  return template.evaluate()
    .setTitle('🌱 Drive Sleep & Green FinOps')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Renvoie les fichiers dormants de l'utilisateur courant pour Ui.html.
 * @returns {Object} Liste des fichiers, KPI globaux et traductions.
 */
function chargerDonneesConsole() {
  const classeur = obtenirClasseurMaitre_();
  const feuilleInv = classeur.getSheetByName(NOMS_FEUILLES.INVENTAIRE);
  const config = lireConfiguration();
  const emailActif = (Session.getActiveUser().getEmail() || '').toLowerCase();
  const fichiers = [];

  const nbColonnes = Object.keys(COLONNES_INVENTAIRE).length;
  if (feuilleInv && feuilleInv.getLastRow() >= 2) {
    const lignes = feuilleInv.getRange(2, 1, feuilleInv.getLastRow() - 1, nbColonnes).getValues();
    lignes.forEach((ligne) => {
      const statut = String(ligne[COLONNES_INVENTAIRE.STATUT] ?? '').trim();
      const proprietaire = String(ligne[COLONNES_INVENTAIRE.PROPRIETAIRE] ?? '').trim().toLowerCase();
      if (statut !== STATUTS_FICHIER.DORMANT && statut !== STATUTS_FICHIER.NOTIFIE) {
        return;
      }
      // Isolation stricte des données : l'utilisateur ne consulte et n'agit que sur ses propres fichiers
      if (!emailActif || proprietaire === emailActif) {
        fichiers.push({
          id: String(ligne[COLONNES_INVENTAIRE.ID]),
          nom: String(ligne[COLONNES_INVENTAIRE.NOM]),
          mimeType: String(ligne[COLONNES_INVENTAIRE.MIME_TYPE]),
          tailleMo: Number(ligne[COLONNES_INVENTAIRE.TAILLE_MO]) || 0,
          derniereActivite: formaterDateFr_(ligne[COLONNES_INVENTAIRE.DERNIERE_ACTIVITE]),
          proprietaire: String(ligne[COLONNES_INVENTAIRE.PROPRIETAIRE]),
          url: String(ligne[COLONNES_INVENTAIRE.URL])
        });
      }
    });
  }

  return {
    fichiers,
    facteurCo2: config.FACTEUR_CO2_KG_PAR_GO_AN,
    textes: TEXTES_INTERFACE
  };
}

/**
 * Affiche la boîte de dialogue « À propos » conforme aux standards FF Labs.
 */
function afficherAPropos() {
  const html = HtmlService.createHtmlOutput(`
    <div style="font-family:'Google Sans',Roboto,Arial,sans-serif;padding:16px;color:#202124;line-height:1.5;">
      <h3 style="margin-top:0;color:#188038;">🌱 ${CONFIGURATION_PAR_DEFAUT.NOM_APPLICATION} (v${CONFIGURATION_PAR_DEFAUT.VERSION})</h3>
      <p>Outil d'hygiène numérique et FinOps par soustraction pour Google Workspace : détection des fichiers en sommeil, mise à la corbeille assistée et suivi de l'empreinte carbone évitée.</p>
      <p style="color:#5f6368;font-size:12px;"><em>Digital sobriety & FinOps automation tool for Google Workspace.</em></p>
      <hr style="border:none;border-top:1px solid #dadce0;margin:16px 0;">
      <p style="font-size:13px;margin-bottom:4px;"><strong>Développeur / Developer :</strong> ${CONFIGURATION_PAR_DEFAUT.AUTEUR}</p>
      <p style="font-size:13px;margin-top:0;"><strong>Site Web :</strong> <a href="${CONFIGURATION_PAR_DEFAUT.SITE_WEB}" target="_blank" style="color:#1a73e8;text-decoration:none;">faucheux.bzh</a></p>
    </div>
  `).setWidth(460).setHeight(270);
  SpreadsheetApp.getUi().showModalDialog(html, 'À propos / About');
}

/**
 * Planifie un déclencheur unique de reprise dans 1 minute pour continuer l'audit par lots.
 */
function planifierRepriseAudit_() {
  supprimerDeclencheursReprise_('lancerAuditDrive');
  ScriptApp.newTrigger('lancerAuditDrive')
    .timeBased()
    .after(60 * 1000)
    .create();
}

/**
 * Supprime les déclencheurs existants associés à une fonction donnée pour éviter les doublons.
 * @param {string} nomFonction
 */
function supprimerDeclencheursReprise_(nomFonction) {
  const declencheurs = ScriptApp.getProjectTriggers();
  declencheurs.forEach((declencheur) => {
    if (declencheur.getHandlerFunction() === nomFonction) {
      ScriptApp.deleteTrigger(declencheur);
    }
  });
}

/**
 * Installe le déclencheur mensuel automatique (le 1er du mois à 7h00) sans créer de doublon.
 */
function installerDeclencheurMensuel() {
  try {
    supprimerDeclencheursReprise_('lancerAuditDrive');
    ScriptApp.newTrigger('lancerAuditDrive')
      .timeBased()
      .onMonthDay(1)
      .atHour(7)
      .create();
    if (SpreadsheetApp.getActiveSpreadsheet()) {
      SpreadsheetApp.getActiveSpreadsheet().toast('Déclencheur mensuel activé (le 1er du mois à 07h00).', '🌱 Drive Sleep', 5);
    }
  } catch (erreur) {
    console.error('Erreur installerDeclencheurMensuel :', erreur);
    SpreadsheetApp.getUi().alert('🌱 Erreur déclencheur', erreur.message, SpreadsheetApp.getUi().ButtonSet.OK);
  }
}
