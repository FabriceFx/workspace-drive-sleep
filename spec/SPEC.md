# Cahier des charges — Drive Sleep & Green FinOps (Mise en sommeil du stockage)

> **Statut** : Validé  
> **Date** : 2026-10-17  

## 1. Contexte et objectif
Les espaces Google Drive d'entreprise accumulent des milliers de fichiers volumineux et obsolètes (exports temporaires, vidéos d'anciennes réunions Meet, archives oubliées) qui consomment du quota de stockage, dégradent la pertinence de la recherche (ainsi que les réponses de Gemini) et alourdissent l'empreinte carbone numérique. L'objectif de cet outil est d'identifier automatiquement les fichiers en sommeil, de proposer une mise à la corbeille assistée en un clic à leurs propriétaires, et de consolider les gains FinOps (Go libérés) et Green IT (équivalent kgCO2e évité) dans un tableau de bord central.

## 2. Utilisateurs et usage
- **Produits Google Workspace ciblés** : Google Sheets (console d'administration et suivi), Google Drive (analyse et mise à la corbeille), Gmail (envoi des rapports d'action), HtmlService (interface de validation rapide).
- **Profil des utilisateurs** : Administrateurs / Responsables applicatifs Workspace (pilotage central) et collaborateurs du domaine (validation de leurs propres fichiers).
- **Mode de déclenchement** :
  - [x] Menu personnalisé (`onOpen`) dans le Google Sheet de pilotage (configuration, lancement manuel, boîte « À propos »).
  - [x] Déclencheur temporel (Time-driven) : Mensuel pour la campagne d'audit et de notification ; auto-reprise à +1 minute pour le traitement par lots.
  - [x] Application Web (`doGet`) et barre latérale : Permet à l'utilisateur de visualiser et confirmer la mise à la corbeille de ses fichiers dormants dans une interface bilingue FR/EN.

## 3. Périmètre fonctionnel
- **Audit paramétrable** : Détection des fichiers non modifiés (et non consultés) depuis X mois (12 mois par défaut) et dépassant une taille minimale Y Mo (5 Mo par défaut pour les binaires ; ancienneté seule pour les fichiers natifs Google).
- **Traitement par lots avec reprise** : Sauvegarde du `pageToken` Drive dans `PropertiesService` pour analyser de grands volumes sans dépasser la limite des 6 minutes.
- **Calcul d'impact Green IT & FinOps** : Conversion automatique du volume identifié et nettoyé en Go, en estimation d'impact carbone annuel (kgCO2e) et en coût financier annuel (€).
- **Notification et validation assistée** : Envoi d'un email récapitulatif bilingue (FR/EN) listant les fichiers candidats avec accès à l'interface de nettoyage ou d'ajout en liste blanche.
- **Sécurité anti-perte** : Utilisation stricte de la mise à la corbeille (`trashed = true`), laissant le délai légal de restauration de 30 jours sur Drive.

## 4. Critères d'acceptation
- [x] **CA-01** : L'initialisation génère automatiquement les onglets `Configuration`, `Inventaire_Dormant`, `Liste_Blanche` et `Tableau_de_Bord` s'ils n'existent pas.
- [x] **CA-02** : Le scan Drive filtre correctement les fichiers selon l'ancienneté et le poids définis, s'interrompt proprement avant 5 minutes et reprend sans doublon.
- [x] **CA-03** : L'interface Web (`doGet`) et la barre latérale s'affichent en Material Design bilingue (FR/EN) et permettent de mettre à la corbeille une sélection de fichiers ou de les ajouter en liste blanche.
- [x] **CA-04** : Le tableau de bord met à jour le total de Go économisés et l'équivalent carbone après chaque campagne de mise en sommeil.
