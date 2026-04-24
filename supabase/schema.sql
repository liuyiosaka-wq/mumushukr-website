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
-- 最终确认通过 Hot Pepper / LINE / 微信完成，此表仅作记录
CREATE TABLE IF NOT EXISTS reservations (
  id         BIGSERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  phone      TEXT NOT NULL,
  email      TEXT,
  date       DATE NOT NULL,
  time       TIME NOT NULL,
  service    TEXT NOT NULL CHECK (service IN ('cut', 'color', 'perm', 'treatment')),
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
