use tauri::Wry;
use serde::{Deserialize, Serialize};
use crate::db;

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyActions {
    pub date: String,
    pub count: i64,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalyticsData {
    pub total_points: i64,
    pub total_actions: i64,
    pub explain_count: i64,
    pub counter_count: i64,
    pub followup_count: i64,
    pub similar_count: i64,
    pub framework_count: i64,
    pub total_child_points: i64,
    pub daily_actions: Vec<DailyActions>,
}

#[tauri::command]
pub async fn get_analytics(app: tauri::AppHandle<Wry>) -> Result<AnalyticsData, String> {
    let path = db::db_path(&app).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || -> anyhow::Result<AnalyticsData> {
        let conn = db::open_db(&path)?;

        let (total_points, total_child_points): (i64, i64) = conn.query_row(
            "SELECT COUNT(*), SUM(CASE WHEN parent_id IS NOT NULL THEN 1 ELSE 0 END) FROM points",
            [],
            |r| Ok((r.get(0)?, r.get::<_, Option<i64>>(1)?.unwrap_or(0))),
        )?;

        let (total_actions, explain_count, counter_count, followup_count, similar_count, framework_count): (i64, i64, i64, i64, i64, i64) = conn.query_row(
            "SELECT COUNT(*),
                    SUM(CASE WHEN action_type='explain'   THEN 1 ELSE 0 END),
                    SUM(CASE WHEN action_type='counter'   THEN 1 ELSE 0 END),
                    SUM(CASE WHEN action_type='followup'  THEN 1 ELSE 0 END),
                    SUM(CASE WHEN action_type='similar'   THEN 1 ELSE 0 END),
                    SUM(CASE WHEN action_type='framework' THEN 1 ELSE 0 END)
             FROM explore_actions",
            [],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?)),
        )?;

        let mut stmt = conn.prepare(
            "SELECT substr(created_at, 1, 10) as date, COUNT(*) as count
             FROM explore_actions
             WHERE created_at >= date('now', '-365 days')
             GROUP BY date
             ORDER BY date ASC",
        )?;
        let daily_actions = stmt
            .query_map([], |r| Ok(DailyActions { date: r.get(0)?, count: r.get(1)? }))?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(AnalyticsData {
            total_points,
            total_actions,
            explain_count,
            counter_count,
            followup_count,
            similar_count,
            framework_count,
            total_child_points,
            daily_actions,
        })
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}
