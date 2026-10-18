/**
 * @fileoverview Points d'entrée principaux (onOpen, menus, console, déclencheurs).
 * Projet : Drive Sleep & Green FinOps (workspace-drive-sleep)
 * Auteur : Fabrice Faucheux (FF Labs - faucheux.bzh)
 */

/**
 * Crée le menu personnalisé à l'ouverture du Google Sheet.
 * @param {GoogleAppsScript.Events.SheetsOnOpen} [e]
 */
function onOpen(e) {
  const t = TEXTES_INTERFACE[obtenirLangueUtilisateur_()];
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
    initialiserEnvironnement({ depuisMenu: true });
    SpreadsheetApp.getActiveSpreadsheet().toast('Les 4 feuilles sont prêtes / All 4 sheets are ready.', '🌱 Drive Sleep', 5);
  } catch (erreur) {
    console.error('Erreur actionMenuInitialiser :', erreur);
    SpreadsheetApp.getUi().alert('🌱 Erreur d\'initialisation', erreur.message, SpreadsheetApp.getUi().ButtonSet.OK);
  }
}

/**
 * Action du menu : lance (ou poursuit) l'audit Drive et affiche le résumé.
 */
function actionMenuAudit() {
  try {
    const resultat = lancerAuditDrive();
    if (resultat.dejaEnCours) {
      SpreadsheetApp.getActiveSpreadsheet().toast('Un audit est déjà en cours d\'exécution. / An audit is already running.', '🌱 Audit Drive', 8);
      return;
    }
    const suite = resultat.reprisePlanifiee ? ' | Suite planifiée automatiquement' : ' | Audit terminé';
    const message = `Scannés : ${resultat.fichiersScannes} | Nouveaux dormants : ${resultat.fichiersRetenus}${suite}`;
    SpreadsheetApp.getActiveSpreadsheet().toast(message, '🌱 Audit Drive', 8);

    if (resultat.fichiersRetenus === 0 && !resultat.reprisePlanifiee) {
      const config = lireConfiguration();
      const diag = resultat.diagnostic || {};
      const lignesDiag = [];
      if (diag.dejaInventorieOuProtege) {
        lignesDiag.push(`• Déjà présents dans Inventaire_Dormant (ou Liste Blanche) : ${diag.dejaInventorieOuProtege}`);
      }
      if (diag.sousDossierProtege || diag.parentExclu) {
        lignesDiag.push(`• Protégés car situés dans un dossier de la Liste Blanche : ${(diag.sousDossierProtege || 0) + (diag.parentExclu || 0)}`);
      }
      if (diag.vueRecente) {
        lignesDiag.push(`• Consultés récemment dans Drive (viewedByMeTime) : ${diag.vueRecente}`);
      }
      if (diag.activiteRecente) {
        lignesDiag.push(`• Modifiés après la date limite (${config.SEUIL_INACTIVITE_MOIS} mois) : ${diag.activiteRecente}`);
      }
      if (diag.tailleTropPetite) {
        lignesDiag.push(`• Poids inférieur au seuil (${config.TAILLE_MIN_MO} Mo) : ${diag.tailleTropPetite}`);
      }
      if (diag.marquesGarder) {
        lignesDiag.push(`• Déjà marqués « Garder » via la console : ${diag.marquesGarder}`);
      }
      if (diag.natifNonInclus) {
        lignesDiag.push(`• Documents natifs Google exclus par configuration : ${diag.natifNonInclus}`);
      }

      let explication = '';
      if (resultat.fichiersScannes === 0) {
        explication = `L'audit n'a trouvé aucun fichier modifié avant la date limite (seuil actuel : ${config.SEUIL_INACTIVITE_MOIS} mois), ou aucun fichier ne vous appartient directement ('me' in owners).\n\n💡 Conseil : Vous pouvez réduire temporairement le paramètre « SEUIL_INACTIVITE_MOIS » (ex. 1 ou 3 mois) dans la feuille « Configuration » pour tester avec des fichiers plus récents.`;
      } else {
        const detail = lignesDiag.length > 0 ? `\n\nDétail des filtres :\n${lignesDiag.join('\n')}` : '';
        const astuce = diag.vueRecente > 0
          ? `\n\n💡 Astuce : ${diag.vueRecente} fichier(s) ont été écartés car leur date d'ouverture/consultation dans Drive est récente. Pour vous baser uniquement sur la date de modification, réglez « IGNORER_CONSULTATION » sur « OUI » dans la feuille « Configuration » puis relancez l'audit.`
          : `\n\n💡 Conseil : Réduisez « SEUIL_INACTIVITE_MOIS » ou « TAILLE_MIN_MO » (ex. 0.1 Mo) dans la feuille « Configuration » puis relancez l'audit.`;
        explication = `${resultat.fichiersScannes} fichier(s) ont été examinés, mais aucun nouveau fichier dormant n'a été retenu.${detail}${astuce}`;
      }
      SpreadsheetApp.getUi().alert('🌱 Résultat de l\'audit Drive', explication, SpreadsheetApp.getUi().ButtonSet.OK);
    }
  } catch (erreur) {
    console.error('Erreur actionMenuAudit :', erreur);
    SpreadsheetApp.getUi().alert('🌱 Erreur lors de l\'audit Drive', erreur.message, SpreadsheetApp.getUi().ButtonSet.OK);
  }
}

/**
 * Action du menu : envoie les notifications par e-mail avec diagnostic interactif.
 * @param {boolean} [forcerRenvoi=false]
 */
function actionMenuNotifier(forcerRenvoi = false) {
  // Défensif : seul un vrai booléen déclenche le renvoi forcé.
  const forcer = forcerRenvoi === true;
  const ui = SpreadsheetApp.getUi();
  try {
    const resultat = envoyerNotificationsProprietaires({ forcerRenvoi: forcer });

    if (resultat.emailsEnvoyes > 0) {
      const complement = resultat.erreurs.length > 0 ? `\n\n${resultat.erreurs.join('\n')}` : '';
      if (complement) {
        ui.alert('🌱 Notifications', `${resultat.emailsEnvoyes} bilan(s) envoyé(s).${complement}`, ui.ButtonSet.OK);
      } else {
        SpreadsheetApp.getActiveSpreadsheet().toast(`${resultat.emailsEnvoyes} bilan(s) envoyé(s) avec succès.`, '🌱 Notifications', 6);
      }
      return;
    }

    if (resultat.erreurs.length > 0) {
      ui.alert('🌱 Échec d\'envoi d\'e-mail', `Une anomalie a empêché l'envoi :\n\n${resultat.erreurs.join('\n')}`, ui.ButtonSet.OK);
      return;
    }

    if (resultat.quotaRestant <= 1) {
      ui.alert('🌱 Quota quotidien atteint', 'Le quota quotidien d\'envoi d\'e-mails Google est épuisé. Google réinitialise ce compteur toutes les 24 heures.', ui.ButtonSet.OK);
      return;
    }

    if (resultat.nbSansProprietaire > 0) {
      ui.alert('🌱 Propriétaires manquants', `${resultat.nbSansProprietaire} fichier(s) dormant(s) n'ont pas d'adresse de propriétaire valide dans l'inventaire : aucun bilan ne peut leur être envoyé.`, ui.ButtonSet.OK);
      return;
    }

    if (resultat.nbDormants === 0) {
      if (resultat.nbDejaNotifies > 0 && !forcer) {
        const reponse = ui.alert(
          '🌱 Fichiers déjà notifiés',
          `Aucun nouveau fichier au statut DORMANT.\n\nLes ${resultat.nbDejaNotifies} fichier(s) répertoriés dans l'inventaire ont déjà le statut NOTIFIE.\n\nSouhaitez-vous forcer un renvoi du bilan par e-mail aux propriétaires ?`,
          ui.ButtonSet.YES_NO
        );
        if (reponse === ui.Button.YES) {
          actionMenuNotifier(true);
        }
      } else {
        ui.alert('🌱 Aucun fichier à notifier', 'Aucun fichier dormant trouvé dans l\'onglet Inventaire_Dormant.\n\nLancez d\'abord l\'audit des fichiers dormants (menu n°2).', ui.ButtonSet.OK);
      }
      return;
    }

    SpreadsheetApp.getActiveSpreadsheet().toast('Aucun bilan n\'a été envoyé.', '🌱 Notifications', 5);
  } catch (erreur) {
    console.error('Erreur actionMenuNotifier :', erreur);
    ui.alert('🌱 Erreur d\'envoi des notifications', erreur.message, ui.ButtonSet.OK);
  }
}

/**
 * Prépare le modèle Ui.html (console de tri) avec la langue, les textes et le seuil d'inactivité.
 * @param {string} langue 'fr' ou 'en'.
 * @returns {GoogleAppsScript.HTML.HtmlOutput} Sortie HTML évaluée.
 */
function construireConsole_(langue) {
  const template = HtmlService.createTemplateFromFile('Ui');
  template.langueInitiale = (langue === 'en' || langue === 'fr') ? langue : 'fr';
  template.textesJson = JSON.stringify(TEXTES_INTERFACE);
  const config = lireConfiguration();
  template.seuilMois = String(config.SEUIL_INACTIVITE_MOIS);
  template.tailleLot = String(config.TAILLE_LOT_DECISIONS);
  return template.evaluate();
}

/**
 * Ouvre la console de tri (analyse du Drive de l'utilisateur courant) dans Google Sheets.
 */
function afficherConsoleNettoyage() {
  try {
    const langue = obtenirLangueUtilisateur_();
    const t = TEXTES_INTERFACE[langue];
    const html = construireConsole_(langue)
      .setTitle(`🌱 ${t.titreConsole}`)
      .setWidth(920)
      .setHeight(700);
    SpreadsheetApp.getUi().showModalDialog(html, `🌱 ${t.titreConsole}`);
  } catch (erreur) {
    console.error('Erreur afficherConsoleNettoyage :', erreur);
    SpreadsheetApp.getUi().alert('🌱 Erreur', erreur.message, SpreadsheetApp.getUi().ButtonSet.OK);
  }
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

/* ===================== Déclencheurs ===================== */

/**
 * Cible du déclencheur ponctuel de reprise (fonction distincte du déclencheur mensuel).
 */
function reprendreAuditDrive() {
  return lancerAuditDrive();
}

/**
 * Cible du déclencheur mensuel : démarre une nouvelle campagne (audit puis bilans e-mail en fin d'audit).
 * Si une campagne précédente est encore en cours, elle est poursuivie plutôt que réinitialisée.
 */
function executerCampagneMensuelle() {
  exigerAdministrateur_();
  PropertiesService.getScriptProperties().setProperty(CLES_PROPRIETES.NOTIFIER_EN_FIN_AUDIT, 'OUI');
  return lancerAuditDrive();
}

/**
 * Cible du déclencheur ponctuel d'envoi des bilans en fin de campagne mensuelle.
 * Le déclencheur est supprimé dès le début pour ne pas s'accumuler.
 */
function envoyerBilansCampagne() {
  exigerAdministrateur_();
  supprimerDeclencheursParFonction_(FONCTIONS_DECLENCHEURS.ENVOI_BILANS);
  const bilan = envoyerNotificationsProprietaires();
  console.info(`Campagne mensuelle : ${bilan.emailsEnvoyes} bilan(s) envoyé(s).`);
  if (bilan.erreurs.length > 0) {
    console.warn(`Anomalies d'envoi : ${bilan.erreurs.join(' | ')}`);
  }
}

/**
 * Planifie l'envoi des bilans dans une exécution distincte, une minute plus tard.
 */
function planifierEnvoiBilans_() {
  supprimerDeclencheursParFonction_(FONCTIONS_DECLENCHEURS.ENVOI_BILANS);
  ScriptApp.newTrigger(FONCTIONS_DECLENCHEURS.ENVOI_BILANS)
    .timeBased()
    .after(60 * 1000)
    .create();
}

/**
 * Planifie un déclencheur unique de reprise dans 1 minute pour continuer l'audit par lots.
 * Ne touche jamais au déclencheur mensuel.
 */
function planifierRepriseAudit_() {
  supprimerDeclencheursParFonction_(FONCTIONS_DECLENCHEURS.REPRISE_AUDIT);
  ScriptApp.newTrigger(FONCTIONS_DECLENCHEURS.REPRISE_AUDIT)
    .timeBased()
    .after(60 * 1000)
    .create();
}

/**
 * Supprime les déclencheurs du projet associés à une fonction donnée.
 * @param {string} nomFonction Nom de la fonction cible.
 * @returns {number} Nombre de déclencheurs supprimés.
 */
function supprimerDeclencheursParFonction_(nomFonction) {
  let nbSupprimes = 0;
  ScriptApp.getProjectTriggers().forEach((declencheur) => {
    if (declencheur.getHandlerFunction() === nomFonction) {
      ScriptApp.deleteTrigger(declencheur);
      nbSupprimes++;
    }
  });
  return nbSupprimes;
}

/**
 * Installe le déclencheur mensuel automatique (le 1er du mois vers 7h00) sans créer de doublon.
 * Nettoie au passage les déclencheurs de l'ancienne version (fonction lancerAuditDrive).
 */
function installerDeclencheurMensuel() {
  try {
    exigerAdministrateur_();
    supprimerDeclencheursParFonction_(FONCTIONS_DECLENCHEURS.CAMPAGNE_MENSUELLE);
    supprimerDeclencheursParFonction_(FONCTIONS_DECLENCHEURS.ANCIENNE_FONCTION);
    ScriptApp.newTrigger(FONCTIONS_DECLENCHEURS.CAMPAGNE_MENSUELLE)
      .timeBased()
      .onMonthDay(1)
      .atHour(7)
      .create();
    if (SpreadsheetApp.getActiveSpreadsheet()) {
      SpreadsheetApp.getActiveSpreadsheet().toast('Campagne mensuelle activée (audit + bilans, le 1er du mois vers 07h00).', '🌱 Drive Sleep', 5);
    }
  } catch (erreur) {
    console.error('Erreur installerDeclencheurMensuel :', erreur);
    SpreadsheetApp.getUi().alert('🌱 Erreur déclencheur', erreur.message, SpreadsheetApp.getUi().ButtonSet.OK);
  }
}
