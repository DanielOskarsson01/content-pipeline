/**
 * Entity Service
 * CRUD operations for the entities table (companies, topics, persons)
 */

const db = require('./db');

/**
 * Create a single entity
 * @param {Object} entity - { entity_type, name, metadata }
 * @returns {Object} Created entity
 */
async function create(entity) {
  const { data, error } = await db
    .from('entities')
    .insert({
      entity_type: entity.entity_type,
      name: entity.name,
      metadata: entity.metadata || {}
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Bulk create entities
 * @param {Array} entities - Array of { entity_type, name, metadata }
 * @returns {Array} Created entities
 */
async function bulkCreate(entities) {
  const records = entities.map(e => ({
    entity_type: e.entity_type,
    name: e.name,
    metadata: e.metadata || {}
  }));

  const { data, error } = await db
    .from('entities')
    .insert(records)
    .select();

  if (error) throw error;
  return data;
}

/**
 * Get entity by ID
 * @param {string} id - Entity UUID
 * @returns {Object|null} Entity or null
 */
async function getById(id) {
  const { data, error } = await db
    .from('entities')
    .select('*')
    .eq('id', id)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

/**
 * List entities with optional filtering and pagination
 * @param {Object} options - { entity_type, search, page, limit }
 * @returns {Object} { data, total, page, limit }
 */
async function list({ entity_type, search, page = 1, limit = 50 } = {}) {
  let query = db.from('entities').select('*', { count: 'exact' });

  if (entity_type) {
    query = query.eq('entity_type', entity_type);
  }

  if (search) {
    query = query.ilike('name', `%${search}%`);
  }

  const offset = (page - 1) * limit;
  query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) throw error;

  return {
    data,
    total: count,
    page,
    limit
  };
}

/**
 * Update entity metadata
 * @param {string} id - Entity UUID
 * @param {Object} updates - { name?, metadata? }
 * @returns {Object} Updated entity
 */
async function update(id, updates) {
  const updateData = { updated_at: new Date().toISOString() };

  if (updates.name !== undefined) updateData.name = updates.name;
  if (updates.metadata !== undefined) updateData.metadata = updates.metadata;

  const { data, error } = await db
    .from('entities')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Delete entity (hard delete)
 * @param {string} id - Entity UUID
 * @returns {boolean} Success
 */
async function remove(id) {
  const { error } = await db
    .from('entities')
    .delete()
    .eq('id', id);

  if (error) throw error;
  return true;
}

/**
 * Get multiple entities by IDs
 * @param {Array<string>} ids - Array of entity UUIDs
 * @returns {Array} Entities
 */
async function getByIds(ids) {
  if (!ids || ids.length === 0) return [];

  const { data, error } = await db
    .from('entities')
    .select('*')
    .in('id', ids);

  if (error) throw error;
  return data;
}

module.exports = {
  create,
  bulkCreate,
  getById,
  getByIds,
  list,
  update,
  remove
};
