/**
 * Template Service
 * CRUD operations for pipeline templates
 */

const db = require('./db');

module.exports = {
  /**
   * List all active templates
   */
  async list() {
    const { data, error } = await db
      .from('templates')
      .select('*')
      .eq('is_active', true)
      .order('name');

    if (error) throw error;
    return data || [];
  },

  /**
   * Get template by ID
   */
  async getById(id) {
    const { data, error } = await db
      .from('templates')
      .select('*')
      .eq('id', id)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  /**
   * Create a new template
   */
  async create({ name, description, stages }) {
    const { data, error } = await db
      .from('templates')
      .insert({ name, description, stages: stages || [] })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Update a template
   */
  async update(id, { name, description, stages, is_active }) {
    const updates = { updated_at: new Date().toISOString() };
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (stages !== undefined) updates.stages = stages;
    if (is_active !== undefined) updates.is_active = is_active;

    const { data, error } = await db
      .from('templates')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Soft delete (deactivate) a template
   */
  async remove(id) {
    const { error } = await db
      .from('templates')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw error;
  }
};
