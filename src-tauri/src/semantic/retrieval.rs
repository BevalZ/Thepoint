use std::collections::HashMap;

use anyhow::Result;
use rusqlite::{params, Connection};

use super::{storage::StoredVector, types::HybridSearchHit};

const RRF_K: f64 = 60.0;
const CANDIDATE_LIMIT: usize = 60;

pub fn cosine(left: &[f32], right: &[f32]) -> Option<f64> {
    if left.len() != right.len() || left.is_empty() {
        return None;
    }
    Some(
        left.iter()
            .zip(right)
            .map(|(a, b)| (*a as f64) * (*b as f64))
            .sum(),
    )
}

pub fn keyword_search(
    conn: &Connection,
    query: &str,
    source_id: Option<&str>,
) -> Result<Vec<HybridSearchHit>> {
    let pattern = format!("%{}%", query.trim().replace('%', "\\%").replace('_', "\\_"));
    let mut stmt = conn.prepare(
        "SELECT c.id, c.source_id, COALESCE(s.title, s.canonical_uri), c.chunk_index,
                c.heading_path, c.text
         FROM source_chunks c JOIN source_documents s ON s.id=c.source_id
         WHERE (?1 IS NULL OR c.source_id=?1)
           AND (c.text LIKE ?2 ESCAPE '\\' OR COALESCE(c.heading_path,'') LIKE ?2 ESCAPE '\\'
                OR COALESCE(s.title,'') LIKE ?2 ESCAPE '\\')
         ORDER BY CASE WHEN c.text LIKE ?2 ESCAPE '\\' THEN 0 ELSE 1 END,
                  c.source_id, c.chunk_index
         LIMIT 60",
    )?;
    let rows = stmt.query_map(params![source_id, pattern], |row| {
        Ok(HybridSearchHit {
            id: row.get(0)?,
            source_id: row.get(1)?,
            source_title: row.get(2)?,
            chunk_index: row.get(3)?,
            heading_path: row.get(4)?,
            text: row.get(5)?,
            score: 0.0,
            keyword_rank: None,
            semantic_rank: None,
            semantic_score: None,
            reason: String::new(),
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

pub fn semantic_search(vectors: Vec<StoredVector>, query_vector: &[f32]) -> Vec<HybridSearchHit> {
    let mut hits = vectors
        .into_iter()
        .filter_map(|item| {
            cosine(query_vector, &item.vector).map(|score| HybridSearchHit {
                id: item.chunk_id,
                source_id: item.source_id,
                source_title: item.source_title,
                chunk_index: item.chunk_index,
                heading_path: item.heading_path,
                text: item.text,
                score: 0.0,
                keyword_rank: None,
                semantic_rank: None,
                semantic_score: Some(score),
                reason: String::new(),
            })
        })
        .collect::<Vec<_>>();
    hits.sort_by(|a, b| {
        b.semantic_score
            .unwrap_or_default()
            .total_cmp(&a.semantic_score.unwrap_or_default())
            .then_with(|| a.id.cmp(&b.id))
    });
    hits.truncate(CANDIDATE_LIMIT);
    hits
}

pub fn reciprocal_rank_fusion(
    keyword: Vec<HybridSearchHit>,
    semantic: Vec<HybridSearchHit>,
    limit: usize,
) -> Vec<HybridSearchHit> {
    let mut fused: HashMap<String, HybridSearchHit> = HashMap::new();
    for (index, mut hit) in keyword.into_iter().enumerate() {
        let rank = index + 1;
        hit.keyword_rank = Some(rank);
        hit.score = 1.0 / (RRF_K + rank as f64);
        fused.insert(hit.id.clone(), hit);
    }
    for (index, hit) in semantic.into_iter().enumerate() {
        let rank = index + 1;
        let contribution = 1.0 / (RRF_K + rank as f64);
        fused
            .entry(hit.id.clone())
            .and_modify(|existing| {
                existing.semantic_rank = Some(rank);
                existing.semantic_score = hit.semantic_score;
                existing.score += contribution;
            })
            .or_insert_with(|| {
                let mut hit = hit;
                hit.semantic_rank = Some(rank);
                hit.score = contribution;
                hit
            });
    }
    let mut hits = fused.into_values().collect::<Vec<_>>();
    for hit in &mut hits {
        hit.reason = match (hit.keyword_rank, hit.semantic_rank) {
            (Some(keyword), Some(semantic)) => {
                format!("关键词第 {keyword}，语义第 {semantic}；RRF 融合")
            }
            (Some(keyword), None) => format!("关键词第 {keyword}"),
            (None, Some(semantic)) => format!("语义相似度第 {semantic}"),
            _ => "检索命中".to_string(),
        };
    }
    hits.sort_by(|a, b| b.score.total_cmp(&a.score).then_with(|| a.id.cmp(&b.id)));
    hits.truncate(limit.clamp(1, 60));
    hits
}

#[cfg(test)]
mod tests {
    use super::*;

    fn hit(id: &str) -> HybridSearchHit {
        HybridSearchHit {
            id: id.into(),
            source_id: "s".into(),
            source_title: "S".into(),
            chunk_index: 0,
            heading_path: None,
            text: id.into(),
            score: 0.0,
            keyword_rank: None,
            semantic_rank: None,
            semantic_score: Some(0.8),
            reason: String::new(),
        }
    }

    #[test]
    fn rrf_rewards_hits_present_in_both_lists() {
        let fused = reciprocal_rank_fusion(vec![hit("a"), hit("b")], vec![hit("b"), hit("c")], 10);
        assert_eq!(fused[0].id, "b");
        assert_eq!(fused[0].keyword_rank, Some(2));
        assert_eq!(fused[0].semantic_rank, Some(1));
    }

    #[test]
    fn rrf_order_is_deterministic_for_ties() {
        let fused = reciprocal_rank_fusion(vec![hit("b")], vec![hit("a")], 10);
        assert_eq!(
            fused.iter().map(|h| h.id.as_str()).collect::<Vec<_>>(),
            vec!["a", "b"]
        );
    }

    #[test]
    fn cosine_rejects_dimension_mismatch() {
        assert_eq!(cosine(&[1.0], &[1.0, 2.0]), None);
    }

    fn hit_at_k(results: &[HybridSearchHit], expected: &str, k: usize) -> usize {
        usize::from(results.iter().take(k).any(|hit| hit.id == expected))
    }

    #[test]
    fn bilingual_fixture_preserves_keyword_baseline_and_improves_recall() {
        // Deterministic stand-in for bilingual E5 behavior: semantic ranks recover
        // cross-language matches while exact keyword ranks retain literal matches.
        let fixtures = [
            ("中文：可重复性危机", "reproducibility", "cross-language"),
            ("English: causal inference", "causal", "literal"),
            ("中文：蛋白质折叠", "protein-folding", "cross-language"),
        ];
        let mut keyword_hit_at_5 = 0;
        let mut hybrid_hit_at_5 = 0;
        for (query, expected, mode) in fixtures {
            let keyword = if mode == "literal" {
                vec![hit(expected), hit("distractor-a")]
            } else {
                vec![hit("distractor-a"), hit("distractor-b")]
            };
            keyword_hit_at_5 += hit_at_k(&keyword, expected, 5);
            let semantic = if query.contains('中') {
                vec![hit(expected), hit("distractor-c")]
            } else {
                vec![hit(expected)]
            };
            let fused = reciprocal_rank_fusion(keyword, semantic, 5);
            hybrid_hit_at_5 += hit_at_k(&fused, expected, 5);
        }
        assert!(hybrid_hit_at_5 >= keyword_hit_at_5);
        assert_eq!(hybrid_hit_at_5, fixtures.len());
    }
}
