/**
 * Generated Content Routes
 * API endpoints for querying and managing final pipeline outputs
 */

const { Router } = require('express');
const db = require('../services/db');
const router = Router();

/**
 * GET /api/content
 * List generated content with filtering
 * Query params: output_type, tags, published, page, limit
 */
router.get('/', async (req, res, next) => {
  try {
    const { output_type, tags, published, page = 1, limit = 50 } = req.query;

    let query = db
      .from('generated_content')
      .select('*, run_entities(entity_snapshot)', { count: 'exact' })
      .order('generated_at', { ascending: false });

    // Filter by output type
    if (output_type) {
      query = query.eq('output_type', output_type);
    }

    // Filter by tags (using PostgreSQL array overlap operator)
    if (tags) {
      const tagArray = tags.split(',').map(t => t.trim());
      // Use overlaps (&&) to find content with ANY of the specified tags
      query = query.overlaps('tags', tagArray);
    }

    // Filter by published status
    if (published === 'true') {
      query = query.not('published_at', 'is', null);
    } else if (published === 'false') {
      query = query.is('published_at', null);
    }

    // Pagination
    const offset = (parseInt(page) - 1) * parseInt(limit);
    query = query.range(offset, offset + parseInt(limit) - 1);

    const { data, error, count } = await query;
    if (error) throw error;

    // Format response
    const content = (data || []).map(item => ({
      ...item,
      entity_name: item.run_entities?.entity_snapshot?.name,
      entity_type: item.run_entities?.entity_snapshot?.entity_type,
      run_entities: undefined
    }));

    res.json({
      data: content,
      total: count,
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (err) { next(err); }
});

/**
 * GET /api/content/:id
 * Get single content item with full data
 */
router.get('/:id', async (req, res, next) => {
  try {
    const { data, error } = await db
      .from('generated_content')
      .select('*, run_entities(entity_snapshot, run_id)')
      .eq('id', req.params.id)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    if (!data) return res.status(404).json({ error: 'Content not found' });

    res.json({
      ...data,
      entity_name: data.run_entities?.entity_snapshot?.name,
      entity_type: data.run_entities?.entity_snapshot?.entity_type,
      run_id: data.run_entities?.run_id,
      run_entities: undefined
    });
  } catch (err) { next(err); }
});

/**
 * POST /api/content/:id/publish
 * Mark content as published
 */
router.post('/:id/publish', async (req, res, next) => {
  try {
    const { data, error } = await db
      .from('generated_content')
      .update({ published_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Content not found' });

    res.json(data);
  } catch (err) { next(err); }
});

/**
 * DELETE /api/content/:id/publish
 * Unpublish content (clear published_at)
 */
router.delete('/:id/publish', async (req, res, next) => {
  try {
    const { data, error } = await db
      .from('generated_content')
      .update({ published_at: null })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Content not found' });

    res.json(data);
  } catch (err) { next(err); }
});

/**
 * PATCH /api/content/:id
 * Update content (tags, quality_score, title)
 */
router.patch('/:id', async (req, res, next) => {
  try {
    const { tags, quality_score, title } = req.body;
    const updates = {};

    if (tags !== undefined) {
      if (!Array.isArray(tags)) {
        return res.status(400).json({ error: 'tags must be an array' });
      }
      updates.tags = tags;
    }
    if (quality_score !== undefined) updates.quality_score = quality_score;
    if (title !== undefined) updates.title = title;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const { data, error } = await db
      .from('generated_content')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Content not found' });

    res.json(data);
  } catch (err) { next(err); }
});

/**
 * GET /api/content/stats
 * Get content statistics
 */
router.get('/stats/summary', async (req, res, next) => {
  try {
    // Count by output type
    const { data: byType } = await db
      .from('generated_content')
      .select('output_type')
      .then(({ data }) => {
        const counts = {};
        (data || []).forEach(item => {
          counts[item.output_type] = (counts[item.output_type] || 0) + 1;
        });
        return { data: counts };
      });

    // Count published vs unpublished
    const { data: published, count: publishedCount } = await db
      .from('generated_content')
      .select('id', { count: 'exact' })
      .not('published_at', 'is', null);

    const { data: unpublished, count: unpublishedCount } = await db
      .from('generated_content')
      .select('id', { count: 'exact' })
      .is('published_at', null);

    res.json({
      by_type: byType,
      published: publishedCount || 0,
      unpublished: unpublishedCount || 0,
      total: (publishedCount || 0) + (unpublishedCount || 0)
    });
  } catch (err) { next(err); }
});

module.exports = router;
