// These terms are used only to validate a submitted nickname. The original
// spelling (including macrons) is retained for display when the check passes.
// Infix matching is reserved for distinctive terms that can form compounds.
const distinctive = [
  "fuck", "motherfucker", "bullshit", "shithead", "shitface", "pieceofshit",
  "asshole", "arsehole", "dickhead", "dickpic", "cockhead", "cocksuck", "wanker",
  "nigger", "nigga", "faggot", "raghead", "zipperhead", "golliwog",
  "whitepower", "whitesupremacy", "heilhitler", "siegheil",
  "pornhub", "pornstar", "pornograph", "blowjob", "handjob", "cumshot",
  "deepthroat", "sexslave", "sextoy", "sexgod", "sexbomb", "sexmachine",
  "sendnudes", "onlyfans", "hentai", "gangbang",
];

// Other terms occur inside ordinary words and surnames. Match complete words
// or phrases only, including words separated into letters by punctuation.
const wholeWords = [
  "ass", "arse", "asses", "bastard", "bastards", "bitch", "bitches", "bitchy",
  "bollocks", "bugger", "buggers", "bullcrap", "cunt", "cunts", "piss", "pissed",
  "pissing", "shit", "shits", "shite", "shitty", "shitting", "twat", "twats",
  "wank", "wanking", "fag", "fags", "dyke", "kike", "chink", "gook", "spic",
  "retard", "retarded", "tranny", "nazi", "nazis", "hitler", "kkk",
  "whore", "whores", "slut", "sluts", "slutty", "cock", "cocks", "dick", "dicks",
  "pussy", "pussies", "penis", "vagina", "dildo", "dildos", "boner", "erection",
  "ballsack", "boobs", "tits", "titties", "sex", "sexy", "sexting", "porn",
  "porno", "cum", "cumming", "jizz", "orgasm", "anal", "rape", "rapist",
  "masturbate", "masturbation", "peado", "paedo", "pedo", "paedophile",
  "pedophile", "bigdick", "bigcock", "suckmydick",
];

// Match elongated spellings without turning a required double letter into
// a single letter (e.g. the ordinary word "as" must remain available).
function elongated(word: string): string {
  return word.replace(/([a-z])\1*/g, (run: string) => `${run[0]}{${run.length},}`);
}

const embeddedTerm = new RegExp(distinctive.map(elongated).join("|"));
const completeTerm = new RegExp(`^(?:${wholeWords.map(elongated).join("|")})$`);

// Common digit substitutions and visually similar letters in mixed-script
// nicknames. This map is for checking only; it never rewrites a student's name.
const substitutions: Record<string, string> = {
  "0": "o", "1": "i", "2": "z", "3": "e", "4": "a", "5": "s", "6": "g",
  "7": "t", "8": "b", "9": "g", "а": "a", "ɑ": "a", "α": "a", "в": "b",
  "β": "b", "с": "c", "ϲ": "c", "е": "e", "ε": "e", "ғ": "f", "ɡ": "g",
  "һ": "h", "н": "h", "і": "i", "ι": "i", "ı": "i", "ј": "j", "к": "k",
  "κ": "k", "ӏ": "l", "м": "m", "μ": "m", "ո": "n", "о": "o", "ο": "o",
  "р": "p", "ρ": "p", "ѕ": "s", "т": "t", "τ": "t", "υ": "u", "ν": "v",
  "х": "x", "χ": "x", "у": "y", "ζ": "z",
};

function folded(token: string): string {
  return Array.from(token, char => substitutions[char] ?? char).join("");
}

export function nicknameIsBlocked(name: string): boolean {
  const plain = name.normalize("NFKD").replace(/\p{M}/gu, "");
  const words = plain.replace(/(\p{Ll})(\p{Lu})/gu, "$1 $2")
    .toLowerCase().split(/[\s._'’\-]+/u).filter(Boolean);
  if (embeddedTerm.test(folded(words.join("")))) return true;

  // Try consecutive words so separators and number decorations cannot hide
  // standalone terms. The caller bounds each nickname to 20 code points.
  for (let start = 0; start < words.length; start++) {
    let candidate = "";
    for (let end = start; end < words.length; end++) {
      candidate += words[end];
      if (completeTerm.test(folded(candidate)) ||
        completeTerm.test(folded(candidate.replace(/^\d+|\d+$/g, "")))) return true;
    }
  }
  return false;
}
