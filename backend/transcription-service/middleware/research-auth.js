/**
 * Middleware для проверки роли исследователя
 * Использует существующий verifyAuthToken и дополнительно проверяет роль 'researcher'
 */

import { verifyAuthToken } from './auth.js';
import { createClient } from '@supabase/supabase-js';

/**
 * Helper function to get Supabase admin client
 */
function getSupabaseAdmin() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error('SUPABASE_URL is required. Please set it in .env file.');
  }

  if (!supabaseKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required. Please set it in .env file.');
  }

  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

/**
 * In-memory rate limiting (simple implementation)
 * В production лучше использовать Redis
 */
const rateLimitStore = new Map();

/**
 * Проверка rate limit для исследователя
 * @param {string} researcherId - ID исследователя
 * @param {number} maxRequests - Максимум запросов
 * @param {number} windowMs - Окно времени в миллисекундах
 * @returns {boolean} true если лимит не превышен
 */
function checkRateLimit(researcherId, maxRequests = 100, windowMs = 60 * 60 * 1000) {
  const now = Date.now();
  const key = `researcher:${researcherId}`;
  
  const record = rateLimitStore.get(key);
  
  if (!record) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  
  // Если окно истекло, сбрасываем счетчик
  if (now > record.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  
  // Проверяем лимит
  if (record.count >= maxRequests) {
    return false;
  }
  
  // Увеличиваем счетчик
  record.count++;
  rateLimitStore.set(key, record);
  
  return true;
}

/**
 * Middleware для проверки роли исследователя
 * Использует verifyAuthToken и дополнительно проверяет роль
 */
export async function authenticateResearcher(req, res, next) {
  try {
    // Сначала проверяем JWT токен через существующий middleware
    // Но не вызываем next() сразу - нам нужна дополнительная проверка роли
    
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        success: false,
        error: 'Unauthorized: Missing or invalid token' 
      });
    }

    const token = authHeader.substring(7);
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('Missing SUPABASE_URL or SUPABASE_ANON_KEY');
      return res.status(500).json({ 
        success: false,
        error: 'Server configuration error' 
      });
    }

    // Create client with the user's token for verification
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    });

    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      console.error('Token verification failed:', error?.message);
      return res.status(401).json({ 
        success: false,
        error: 'Unauthorized: Invalid token' 
      });
    }

    // Получаем профиль через admin client для проверки роли
    const adminSupabase = getSupabaseAdmin();
    const { data: profile, error: profileError } = await adminSupabase
      .from('profiles')
      .select('id, role, clinic_id, email, full_name')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      console.error('Error fetching profile:', profileError);
      return res.status(401).json({ 
        success: false,
        error: 'Unauthorized: Profile not found' 
      });
    }

    // Проверяем роль исследователя
    if (profile.role !== 'researcher') {
      return res.status(403).json({ 
        success: false,
        error: 'Forbidden: Researcher role required' 
      });
    }

    // Проверяем, что исследователь не привязан к клинике
    if (profile.clinic_id !== null) {
      console.warn(`Researcher ${user.id} has clinic_id set, which should be NULL`);
      // Не блокируем, но логируем предупреждение
    }

    // Проверка rate limit
    const rateLimitOk = checkRateLimit(user.id, 100, 60 * 60 * 1000); // 100 запросов в час
    if (!rateLimitOk) {
      return res.status(429).json({ 
        success: false,
        error: 'Too many requests. Rate limit exceeded. Please try again later.' 
      });
    }

    // Добавляем информацию о исследователе в req
    req.user = {
      id: user.id,
      email: user.email,
      clinic_id: profile.clinic_id,
    };

    req.researcher = {
      id: profile.id,
      email: profile.email,
      full_name: profile.full_name,
      role: profile.role,
      clinic_id: profile.clinic_id,
    };

    next();
  } catch (err) {
    console.error('Error in authenticateResearcher:', err);
    return res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
}

