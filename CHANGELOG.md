# Journal des modifications / Changelog

Toutes les modifications notables de ce projet sont consignées dans ce fichier.
*EN: All notable changes to this project will be documented in this file.*

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/).

---

## [1.3.1] - 2026-10-18

### 🎯 Angle émotionnel : L'angle douleur — La fin de la navigation à l'aveugle
> *Retrouver un vieux document dormant de 50 Mo dans un tableau d'inventaire, c'est bien. Mais devoir deviner d'où il sort, dans quel projet enfoui ou quel dossier partagé il réside avant d'oser le supprimer ou le classer, c'était le cauchemar du nettoyage. Avec le lien direct vers le dossier parent intégré à chaque ligne d'inventaire, vous ouvrez son contexte en un seul clic sans plus jamais chercher dans le vide.*

### Ajouté / Added
- **Colonne « Dossier_Parent » avec lien direct** : Nouvelle colonne dans la feuille `Inventaire_Dormant` affichant le nom du dossier conteneur formaté sous forme de lien cliquable direct (`=HYPERLINK(...)`) vers Google Drive.
- **Résolution optimisée avec cache mémoire** : Récupération du nom réel du dossier via Drive API avec mise en cache (`cacheDossiersParent`) pour minimiser les requêtes, et repli vers `Mon Drive` pour les fichiers situés à la racine.
- **Migration automatique non destructive** : Si un classeur existant possède déjà une feuille `Inventaire_Dormant` avec 9 colonnes, la colonne `Dossier_Parent` est automatiquement insérée à l'emplacement idoine sans altérer les données existantes.
- **Suite de tests** : Ajout du test unitaire `test_CA10_formuleDossierParent` et renforcement de `test_CA05_constantesColonnes`.

### Corrigé (revue du 18/10) / Fixed
- **Limite des 6 minutes** : cache unique des métadonnées de dossiers (`construireCacheDossiers_`, un seul appel Drive par dossier au lieu de trois), dossier parent résolu uniquement pour les fichiers retenus, pages de 200 fichiers et garde-fou intra-page (`DUREE_LIMITE_PAGE_MS`) : une page trop longue est abandonnée puis rejouée à la reprise, sans perte ni doublon.
- **Séparateur de formule par locale** : adaptation dynamique du séparateur de paramètres pour les formules injectées (`=HYPERLINK`) via `obtenirSeparateurFormule_()` (point-virgule pour les locales européennes `fr_FR`, virgule pour `en_US`), empêchant les erreurs d'analyse de formule Sheets.
- **Diagnostic et guidage si aucun fichier retenu** : affichage d'une boîte de dialogue explicative avec astuces de paramétrage (seuils d'inactivité et de taille) si l'audit se termine avec 0 fichier éligible.
- **Réinitialisation des jetons et verrous orphelins** : purge automatique de `VERROU_AUDIT`, `JETON_PAGE_DRIVE` et `DATE_LIMITE_AUDIT` lors d'une réinitialisation manuelle depuis le menu.
- **Vérificateur des dossiers à la corbeille retiré** : redondant avec la requête `trashed = false` (Drive marque aussi `trashed` les fichiers d'un dossier mis à la corbeille) et coûteux en appels.
- **Synchronisation de la corbeille** : écriture sous verrou de script ; retirée de `mettreAJourTableauDeBord` (qui n'interroge plus Drive à chaque action de la console).
- **Migration de l'inventaire fiabilisée** : reconnaissance exacte de l'ancien format, et contrôle du format (`verifierSchemaInventaire_`) avant toute lecture ou écriture — un onglet non migré bloque avec un message explicite au lieu de lire les statuts dans la mauvaise colonne.
- **Console** : un fichier déjà dans l'état visé est classé « déjà fait » (sorti de la liste, non compté dans les gains) ; « Garder » sur un fichier à la corbeille est refusé.
- **Noms de fichiers interprétés comme formules** : un nom commençant par `=`, `+`, `-` ou `@` est neutralisé (`protegerTexteCellule_`).
- Tests : 20 tests (mise à jour de `test_CA10_formuleDossierParent`, `test_CA11_protectionNomCommeFormule` et `test_CA11_schemaInventaireControle`).

---

## [1.3.0] - 2026-10-18

### 🎯 Angle émotionnel : Le pouvoir redonné au collaborateur
> *On imagine souvent que pour assainir le stockage d'une organisation, il faut un administrateur tout-puissant qui scrute les fichiers de chacun et impose des purges massives. C'est faux. L'écologie et l'hygiène numérique ne fonctionnent durablement que lorsqu'on redonne le pouvoir d'agir à chaque collaborateur, dans l'intimité de son propre Drive, sans crainte de jugement et avec la certitude apaisante de pouvoir annuler à tout moment.*

### Ajouté / Added
- **Console de tri personnelle** (`LibreService.gs`, menu 4) : l'utilisateur analyse et trie son propre Drive en direct.
- Interface pour débutants : écran d'accueil rassurant, analyse avec progression, fichiers triés du plus gros au plus petit, bouton « Annuler » après mise à la corbeille, gain exprimé en équivalent photos, FAQ.
- « Garder » via une propriété Drive (`properties`) posée sur le fichier (exclusion durable, aussi respectée par l'audit).
- Compteurs anonymes de la console dans le tableau de bord, intégrés aux totaux CO2 / €.
- Contrôle d'accès administrateur (`ADMINISTRATEURS`) sur toutes les fonctions publiques d'administration.

### Corrigé (revue du 18/10) / Fixed
- L'envoi des bilans de fin de campagne s'exécute dans un déclencheur séparé (`envoyerBilansCampagne`) : il ne peut plus être coupé par la limite des 6 minutes de l'audit.
- Une reprise d'audit en erreur est replanifiée automatiquement (3 tentatives, puis statut `ECHEC`) au lieu de bloquer la campagne en silence.
- Date limite calculée sans débordement de fin de mois (`calculerDateLimite_`).
- Console : une erreur d'analyse n'affiche plus « Bravo, aucun fichier en sommeil » ; un bouton permet de relancer.
- Console : badge « 👥 Partagé » et avertissement dans la confirmation lorsque des fichiers partagés vont être mis à la corbeille.
- **Détection des fichiers à la corbeille** : Exclusion stricte des fichiers et des dossiers parents déjà à la corbeille (`trashed`, `explicitlyTrashed` et vérification récursive `estDansDossierCorbeille_`), synchronisation automatique des statuts dans `Inventaire_Dormant` (`synchroniserStatutsCorbeilleInventaire_`) et gestion sans échec des fichiers déjà à la corbeille dans la console.
- Libellés : « Libéré pendant cette session », FAQ « Garder » et nouvelle question sur les fichiers partagés.

### Supprimé / Removed
- **Application Web** : `doGet` et la section `webapp` du manifeste sont retirés ; la console s'ouvre uniquement depuis le menu du classeur.
- `traiterDecisionsUtilisateur` et `chargerDonneesConsole` (remplacées par `analyserMonDrive`, `mettreCorbeilleMesFichiers`, `conserverMesFichiers`, `annulerCorbeilleMesFichiers`).

### Modifié / Changed
- Le bouton du bilan e-mail pointe vers le classeur (menu › Console).

---

## [1.2.0] - 2026-10-17

### 🎯 Angle émotionnel : Le coût de l'inaction
> *Vous pensiez que votre audit automatique tournait paisiblement en arrière-plan chaque mois ? En réalité, un simple conflit de déclencheur ou un timeout silencieux suffisait à paralyser vos nettoyages sans laisser de trace. Avec la v1.2.0, finie l'illusion : vos campagnes mensuelles sont indestructibles, vos suppressions massives sont enfin synchronisées à la seconde près, et chaque octet décompté correspond exactement à ce que Google vous facture.*

### Corrigé / Fixed
- Le déclencheur mensuel n'est plus supprimé à la fin de chaque audit (fonctions distinctes `reprendreAuditDrive` / `executerCampagneMensuelle`).
- La date limite de l'audit est figée pour toute la campagne : le jeton de page Drive reste valide d'une reprise à l'autre.
- Deux audits ne peuvent plus tourner en même temps (verrou logique horodaté).
- La liste blanche protège désormais toute l'arborescence d'un dossier, pas seulement ses enfants directs.
- Mise à la corbeille par lots de 100 depuis la console, appels Drive hors verrou : plus de dépassement des 6 minutes ni de fichiers mis à la corbeille sans mise à jour de la feuille.
- La console ne retire de la liste que les fichiers réellement traités.
- Les envois d'e-mails et les décisions utilisateurs n'écrivent plus que les colonnes Statut / Date_Traitement, sous verrou (plus d'écrasement concurrent).
- L'audit automatique ne supprime plus les onglets vides du classeur.

### Sécurité / Security
- Contrôle de propriété côté serveur dans `traiterDecisionsUtilisateur` ; la console refuse de s'afficher sans identité utilisateur (plus de repli « tous les fichiers »).
- Liens assainis (`https://` uniquement) dans la console et les e-mails ; paramètres de la feuille Configuration validés par liste blanche de clés.

### Modifié / Changed
- Taille réelle via `quotaBytesUsed` (révisions et fichiers natifs compris).
- Dates stockées en vraies dates dans la feuille (indépendant des paramètres régionaux).
- Aucune présélection dans la console ; « Tout cocher » n'agit que sur les fichiers affichés.
- La campagne mensuelle envoie les bilans e-mail en fin d'audit, conformément à la spécification.
- Les lignes sans propriétaire valide ne sont plus réattribuées à l'utilisateur de la session.

---

## [1.1.0] - 2026-10-17

### 🎯 Angle émotionnel : La terre promise de la clarté et du contrôle
> *Vous connaissez ce sentiment d'étouffement face à un Google Drive saturé où des milliers de fichiers fantômes s'accumulent sans que personne n'ose les toucher par peur de supprimer un document crucial ? Retrouvez la sérénité d'un espace de travail épuré, où chaque méga-octet libéré est une victoire concrète pour la planète et votre budget, avec la garantie absolue de pouvoir restaurer vos documents à tout instant.*

### Ajouté / Added
- **Interface Material Design 3 (MD3)** : Expérience utilisateur complètement repensée avec police moderne (Outfit / Inter), micro-animations, badges d'état et élévation dynamique.
- **KPI réactifs en temps réel** : Le volume (Mo/Go), le nombre de fichiers et les émissions carbone évitées (gCO2e) se recalculent instantanément au clic sur les cases à cocher.
- **Sécurité anti-fausse manipulation** : Dialogue modal natif `<dialog>` avec confirmation explicite indiquant le nombre précis de fichiers et le volume exact avant toute mise à la corbeille.
- **Indicateur de chargement asynchrone (Skeleton loader)** : Plus d'écran blanc pendant la récupération des données via `google.script.run`.
- **Filtre de recherche instantané** : Recherche instantanée par nom de fichier directement dans la console de nettoyage.
- **Affichage et filtrage par type de fichier** : Identification visuelle immédiate dans la console (icône dédiée et badge MD3 pour Google Sheets, Docs, Slides, Formulaires, PDF, Excel, Word, Archives, Vidéos, etc.) et filtrage combiné par nom et par format.
- **Résilience réseau & Quotas** : Fonction `executerAvecRetry_` avec backoff exponentiel pour absorber les pics de charge et erreurs transitoires 429 de l'API Google Drive.
- **Gestion globale des exceptions** : Protection `try/catch` sur l'ensemble des actions de menu avec alertes utilisateurs claires et actionnables.

### Modifié / Changed
- **Isolation stricte des données** : Suppression du seuil global dans `chargerDonneesConsole()` afin qu'un utilisateur ne voie et n'agisse que sur ses propres fichiers en mode collaboratif.
- **Architecture de constantes** : Introduction de `COLONNES_INVENTAIRE` et `COLONNES_LISTE_BLANCHE` pour éliminer tout couplage aux index numériques magiques.
- **Envois d'e-mails résilients & interactifs** : Ajout du corps de texte brut obligatoire `body` dans `MailApp.sendEmail()`, détection dynamique des colonnes d'inventaire, gestion interactive du renvoi pour les fichiers déjà au statut `NOTIFIE` et diagnostic précis en cas de quota épuisé ou d'anomalie.
- **Nettoyage automatique de l'onglet initial** : L'option 1 d'initialisation supprime automatiquement la feuille par défaut vierge (`Feuille 1` ou `Sheet1`) pour ne laisser que les 4 onglets métier et active la vue sur le `Tableau_de_Bord`.
- **Sécurisation des expressions régulières** : Remplacement des substitutions `String.replace()` par des fonctions de rappel `() => String(valeur)` conformément aux standards de robustesse.

---

## [1.0.0] - 2026-10-17

### Ajouté / Added
- Audit paginé Google Drive API v3 avec gestion automatique de la limite des 6 minutes (reprise par déclencheur programmable).
- Filtrage hybride binaire (poids minimum + ancienneté) et natif Google (Docs/Sheets/Slides).
- Tableau de bord Green IT et FinOps avec calcul d'empreinte carbone évitée et économies financières.
- Système d'exclusion par liste blanche permanente (`Liste_Blanche`).
- Campagne mensuelle de bilan de sobriété numérique par e-mail avec résumé bilingue FR/EN.
- Suite de tests unitaires intégrée (`Tests.gs`).
