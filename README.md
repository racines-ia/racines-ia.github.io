# Tiya — agent IA pour Android

Tiya contrôle ton téléphone à ta place : elle ouvre les applications, lit l'écran, touche, écrit, lit et répond aux messages, choisit des photos dans la galerie. Tu lui parles ou tu lui écris.

**Cerveau :** Gemini (palier gratuit) ou Claude, au choix dans les réglages.
**Créé par :** cuervo.co

## Installer
1. Ouvre l'onglet **Releases** de ce dépôt et télécharge **Tiya.apk**.
2. Installe-le (autorise « sources inconnues » si Android le demande).
3. Dans Tiya : ajoute ta clé API, active Tiya dans **Accessibilité**, puis autorise le micro.

Si Android dit « paramètre restreint » : Réglages › Applications › Tiya › menu ⋮ › **Autoriser les paramètres restreints**.

## Utiliser
- Depuis l'app : écris ou dicte une tâche.
- Depuis n'importe où : la **bulle flottante** « T ». 🎤 pour parler, ■ pour arrêter.
- Pour les actions sensibles (envoyer, supprimer, partager, appeler), Tiya demande d'abord ta confirmation.
- Les apps de banque et de mobile money sont bloquées par défaut (modifiable dans les réglages).

## Compilation
Chaque `push` sur `main` lance GitHub Actions, qui compile l'APK et le publie dans **Releases**.

## Structure
- `lib/` : interface Flutter (chat, réglages, configuration)
- `android/app/src/main/kotlin/co/cuervo/tiya/` :
  - `TiyaService.kt` : service d'accessibilité (voir l'écran, toucher, écrire, voix)
  - `TiyaAgent.kt` : boucle de l'agent (regarder → décider → agir)
  - `LlmClient.kt` : appels à Gemini et à Claude
  - `ScreenReader.kt` : transforme l'écran en liste d'éléments numérotés
  - `TiyaOverlay.kt` : bulle flottante
