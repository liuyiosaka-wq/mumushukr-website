-- =============================================
-- SHUKR Hair Salon — Supabase 数据库建表
-- 在 Supabase 控制台 → SQL Editor 中执行此文件
-- =============================================

-- Hot Pepper 空档缓存表
-- 由 OpenClaw 每2小时抓取后通过 Webhook 写入
CREATE TABLE IF NOT EXISTS availability_cache (
  id         BIGSERIAL PRIMARY KEY,
  scraped_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  data       JSONB NOT NULL,
  source     TEXT NOT NULL DEFAULT 'hotpepper'
);

-- 只保留最新一条记录的索引（便于快速查询）
CREATE INDEX IF NOT EXISTS idx_availability_cache_scraped_at
  ON availability_cache (scraped_at DESC);

-- 网页预约表单申请表
-- 最终确认通过 Hot Pepper / 微信 完成，此表仅作记录
-- service 字段历史上限定 4 个 enum，2026-05 起扩展到 6 个细分项
-- （cut / color / color_cut / perm_men / perm_women_long / treatment）
-- 已建表数据库需执行迁移：
--   ALTER TABLE reservations DROP CONSTRAINT IF EXISTS reservations_service_check;
--   ALTER TABLE reservations ADD CONSTRAINT reservations_service_check
--     CHECK (service IN ('cut', 'color', 'color_cut', 'perm_men', 'perm_women_long', 'treatment'));
CREATE TABLE IF NOT EXISTS reservations (
  id         BIGSERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  phone      TEXT NOT NULL,
  email      TEXT,
  date       DATE NOT NULL,
  time       TIME NOT NULL,
  service    TEXT NOT NULL CHECK (service IN ('cut', 'color', 'color_cut', 'perm_men', 'perm_women_long', 'treatment')),
  stylist    TEXT CHECK (stylist IN ('yuna', 'yu')),
  notes      TEXT,
  lang       TEXT NOT NULL DEFAULT 'ja' CHECK (lang IN ('ja', 'zh')),
  status     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reservations_date
  ON reservations (date);

CREATE INDEX IF NOT EXISTS idx_reservations_created_at
  ON reservations (created_at DESC);

-- 加盟咨询表（FC 页表单提交数据）
CREATE TABLE IF NOT EXISTS franchise_inquiries (
  id         BIGSERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  phone      TEXT NOT NULL,
  email      TEXT NOT NULL,
  area       TEXT,
  experience TEXT CHECK (experience IN ('beauty', 'management', 'none') OR experience IS NULL),
  budget     TEXT CHECK (budget IN ('under500', '500-1000', 'over1000', 'tbd') OR budget IS NULL),
  notes      TEXT,
  lang       TEXT NOT NULL DEFAULT 'ja' CHECK (lang IN ('ja', 'zh')),
  status     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'contacted', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_franchise_inquiries_created_at
  ON franchise_inquiries (created_at DESC);

-- 招聘表单（应聘 / 推荐合表，用 kind 区分）
-- 字段差异较大，整体 payload 存 JSONB
CREATE TABLE IF NOT EXISTS recruit_submissions (
  id         BIGSERIAL PRIMARY KEY,
  kind       TEXT NOT NULL CHECK (kind IN ('apply', 'refer')),
  payload    JSONB NOT NULL,
  lang       TEXT NOT NULL DEFAULT 'ja' CHECK (lang IN ('ja', 'zh')),
  status     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'contacted', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recruit_submissions_created_at
  ON recruit_submissions (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_recruit_submissions_kind
  ON recruit_submissions (kind);

-- 专栏文章表（CMS 后台管理）
-- 替代原 assets/articles.json + articles/*.md 文件方案，由 admin 后台增删改
-- body_ja / body_cn 存正文 markdown；cover 存 Storage 公开 URL 或相对路径
-- 配图上传到 Storage 桶 article-images（public）
CREATE TABLE IF NOT EXISTS articles (
  id          TEXT PRIMARY KEY,                 -- kebab-case slug，对应 article.html?id=
  category    TEXT NOT NULL CHECK (category IN ('trend','care','brand','company','ec','ai')),
  featured    BOOLEAN NOT NULL DEFAULT FALSE,   -- 整表仅一条 true（应用层保证）
  published   BOOLEAN NOT NULL DEFAULT TRUE,    -- 草稿 / 上线开关
  date        DATE NOT NULL,
  cover       TEXT DEFAULT '',
  url         TEXT DEFAULT '',                  -- 非空 = 外链，点击新窗口打开
  title_ja    TEXT NOT NULL,
  title_cn    TEXT NOT NULL,
  excerpt_ja  TEXT,
  excerpt_cn  TEXT,
  author_ja   TEXT,
  author_cn   TEXT,
  dept_ja     TEXT,
  dept_cn     TEXT,
  body_ja     TEXT DEFAULT '',
  body_cn     TEXT DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_articles_date ON articles (date DESC);

ALTER TABLE articles ENABLE ROW LEVEL SECURITY;

-- Storage 桶（在 SQL Editor 执行一次；服务端 service_role 上传，公开读取）
-- INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
-- VALUES ('article-images', 'article-images', true, 10485760,
--   ARRAY['image/jpeg','image/png','image/webp','image/gif'])
-- ON CONFLICT (id) DO NOTHING;
