"""Ajuste le build.gradle généré par `flutter create` :
- minSdk 26 (nécessaire pour les gestes et l'accessibilité avancée)
- signature fixe de Tiya, pour que les mises à jour s'installent par-dessus.
"""
import os
import re
import sys

KTS = "android/app/build.gradle.kts"
GROOVY = "android/app/build.gradle"

STORE = "../../signing/tiya-release.jks"
PASS = "tiya-cuervo-2026"

if os.path.exists(KTS):
    path = KTS
    s = open(path).read()
    s = re.sub(r"minSdk\s*=\s*flutter\.minSdkVersion", "minSdk = 26", s)
    block = (
        "    signingConfigs {\n"
        '        create("tiya") {\n'
        f'            storeFile = file("{STORE}")\n'
        f'            storePassword = "{PASS}"\n'
        '            keyAlias = "tiya"\n'
        f'            keyPassword = "{PASS}"\n'
        "        }\n"
        "    }\n\n"
    )
    s = s.replace("    buildTypes {", block + "    buildTypes {", 1)
    s = s.replace('signingConfig = signingConfigs.getByName("debug")', 'signingConfig = signingConfigs.getByName("tiya")')
    ok = 'getByName("tiya")' in s and 'create("tiya")' in s
elif os.path.exists(GROOVY):
    path = GROOVY
    s = open(path).read()
    s = re.sub(r"minSdkVersion\s+flutter\.minSdkVersion", "minSdkVersion 26", s)
    s = re.sub(r"minSdk\s*=\s*flutter\.minSdkVersion", "minSdk = 26", s)
    block = (
        "    signingConfigs {\n"
        "        tiya {\n"
        f"            storeFile file('{STORE}')\n"
        f"            storePassword '{PASS}'\n"
        "            keyAlias 'tiya'\n"
        f"            keyPassword '{PASS}'\n"
        "        }\n"
        "    }\n\n"
    )
    s = s.replace("    buildTypes {", block + "    buildTypes {", 1)
    s = re.sub(r"signingConfig\s*=?\s*signingConfigs\.debug", "signingConfig signingConfigs.tiya", s)
    s = s.replace('signingConfig = signingConfigs.getByName("debug")', "signingConfig signingConfigs.tiya")
    ok = "signingConfigs.tiya" in s
else:
    sys.exit("build.gradle introuvable")

open(path, "w").write(s)
if not ok:
    print(s)
    sys.exit("Impossible d'appliquer la signature Tiya")
print("Gradle ajusté :", path)
