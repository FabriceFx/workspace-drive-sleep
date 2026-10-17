# Journal des modifications / Changelog

Toutes les modifications notables de ce projet sont consignées dans ce fichier.
*EN: All notable changes to this project will be documented in this file.*

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/).

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
