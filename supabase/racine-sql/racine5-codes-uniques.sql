-- Codes personnels uniques par école (appliqué le 2026-11-09)
create unique index if not exists ecole_codes_school_code_uniq on ecole_codes(school_id, code);
-- ecole_strip_code : refuse un code déjà utilisé par un autre profil de la même école
-- ecole_free_code (trigger after delete) : un profil supprimé libère son code
