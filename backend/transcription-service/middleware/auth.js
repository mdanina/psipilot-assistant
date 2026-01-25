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
 * Middleware для проверки JWT токена Supabase
 * Добавляет user и profile в req.user
 */
export async function verifyAuthToken(req, res, next) {
  try {
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

    // Получаем профиль пользователя для clinic_id через admin client
    // Это позволяет обойти RLS и гарантировать доступ к профилю
    let clinic_id = null;
    try {
      const adminSupabase = getSupabaseAdmin();
      const { data: profile, error: profileError } = await adminSupabase
        .from('profiles')
        .select('id, clinic_id')
        .eq('id', user.id)
        .single();

      if (profileError) {
        console.error('Error fetching profile:', profileError);
        // SECURITY: Блокируем запрос если профиль не найден —
        // это может быть признаком проблемы с данными или атаки
        return res.status(403).json({
          success: false,
          error: 'Access denied: User profile not found'
        });
      }

      clinic_id = profile?.clinic_id || null;
    } catch (err) {
      console.error('Error getting admin client for profile:', err);
      return res.status(500).json({
        success: false,
        error: 'Internal server error: Profile lookup failed'
      });
    }

    // Добавляем user и clinic_id в req.user
    req.user = {
      id: user.id,
      email: user.email,
      clinic_id,
    };

    next();
  } catch (err) {
    console.error('Error verifying token:', err);
    return res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
}






