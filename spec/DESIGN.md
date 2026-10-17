# Architecture et conception technique — Drive Sleep & Green FinOps

> **Référence** : `spec/SPEC.md`  
> **Date** : 2026-10-17  

## 1. Vue d'ensemble
L'architecture repose sur un Google Sheet maître servant de console d'administration et de base de données légère, couplé au service avancé Google Drive API (v3) pour l'inspection rapide des métadonnées et à une interface `HtmlService` (barre latérale et Web App `doGet`) permettant aux utilisateurs de valider la mise à la corbeille ou la mise en liste blanche de leurs fichiers dormants.

## 2. Découpage des fichiers (`src/`)
| Fichier | Rôle et responsabilité |
| :--- | :--- |
| `src/appsscript.json` | Manifeste du projet (runtime V8, fuseau `Europe/Paris`, service avancé Drive v3, scopes OAuth). |
| `src/Config.gs` | Constantes globales (`MAJUSCULES_SNAKE`), dictionnaire bilingue FR/EN, lecture/écriture des paramètres. |
| `src/Main.gs` | Points d'entrée (`onOpen`, `doGet`, orchestration des campagnes, déclencheurs de reprise et boîte « À propos »). |
| `src/DriveService.gs` | Recherche paginée via l'API Drive avancée, filtrage hybride (binaires vs fichiers natifs Google) et mise à la corbeille. |
| `src/SheetService.gs` | Initialisation des 4 onglets, lectures/écritures groupées (`getValues`/`setValues`), calcul des KPI du tableau de bord. |
| `src/MailService.gs` | Génération et envoi des rapports mensuels bilingues avec vérification des quotas (`MailApp.getRemainingDailyQuota()`). |
| `src/Ui.html` | Interface utilisateur `HtmlService` (Web App & Barre latérale) en Material Design bilingue FR/EN. |
| `src/Tests.gs` | Suite de tests unitaires et d'intégration (`runAllTests()`). |
