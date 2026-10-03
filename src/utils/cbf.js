/**
 * Content-Based Filtering — Jaccard Similarity Engine
 */

export function buildFeatureVector(anime, allTags) {
  const features = new Set(
    [
      ...(anime.genres || []),
      ...(anime.tags || []).map(t => (typeof t === 'string' ? t : t?.name || ''))
    ].filter(Boolean).map(g => g.toLowerCase().trim())
  );
  return allTags.map(tag => (features.has(tag.toLowerCase().trim()) ? 1 : 0));
}

export function jaccardSimilarity(vecA, vecB) {
  let intersection = 0, union = 0;
  for (let i = 0; i < vecA.length; i++) {
    if (vecA[i] || vecB[i]) union++;
    if (vecA[i] && vecB[i]) intersection++;
  }
  return union === 0 ? 0 : intersection / union;
}

export function getRecommendations(currentAnime, candidatePool, n = 12) {
  if (!currentAnime || !candidatePool || candidatePool.length === 0) return [];

  const allTagsSet = new Set();
  [...candidatePool, currentAnime].forEach(anime => {
    (anime.genres || []).forEach(g => allTagsSet.add(g.toLowerCase().trim()));
    (anime.tags || []).forEach(t => {
      const name = typeof t === 'string' ? t : t?.name;
      if (name) allTagsSet.add(name.toLowerCase().trim());
    });
  });
  const allTags = [...allTagsSet].sort();

  if (allTags.length === 0) {
    return candidatePool
      .filter(a => String(a.id) !== String(currentAnime.id))
      .sort(() => Math.random() - 0.5)
      .slice(0, n);
  }

  const currentVec = buildFeatureVector(currentAnime, allTags);
  const currentFeatures = new Set(
    [...(currentAnime.genres || []), ...(currentAnime.tags || []).map(t => typeof t === 'string' ? t : t?.name || '')]
      .filter(Boolean).map(g => g.toLowerCase().trim())
  );

  return candidatePool
    .filter(a => String(a.id) !== String(currentAnime.id))
    .map(anime => {
      const vec = buildFeatureVector(anime, allTags);
      const score = jaccardSimilarity(currentVec, vec);
      const animeFeatures = new Set(
        [...(anime.genres || []), ...(anime.tags || []).map(t => typeof t === 'string' ? t : t?.name || '')]
          .filter(Boolean).map(g => g.toLowerCase().trim())
      );
      const matchedTags = [...currentFeatures].filter(f => animeFeatures.has(f));
      return { ...anime, _score: score, _matchedTags: matchedTags };
    })
    .sort((a, b) => b._score - a._score)
    .slice(0, n);
}
