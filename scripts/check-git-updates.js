import { execSync } from 'child_process';

console.log('🔍 Проверка обновлений на GitHub...\n');

try {
  // Получаем последние изменения с удаленного репозитория
  console.log('📥 Получаю обновления с origin...');
  execSync('git fetch origin', { stdio: 'inherit' });
  
  // Проверяем статус
  console.log('\n📊 Статус репозитория:');
  execSync('git status', { stdio: 'inherit' });
  
  // Проверяем, есть ли новые коммиты
  console.log('\n🔍 Проверяю наличие новых коммитов...');
  const localCommit = execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
  const remoteCommit = execSync('git rev-parse origin/main', { encoding: 'utf-8' }).trim();
  
  if (localCommit === remoteCommit) {
    console.log('\n✅ Локальная ветка синхронизирована с origin/main');
    console.log('   Нет новых обновлений на GitHub.');
  } else {
    console.log('\n🔄 Обнаружены новые коммиты на GitHub!');
    console.log('\n📋 Новые коммиты:');
    execSync(`git log ${localCommit}..${remoteCommit} --oneline`, { stdio: 'inherit' });
    
    console.log('\n📥 Выполняю git pull...');
    execSync('git pull origin main', { stdio: 'inherit' });
    console.log('\n✅ Локальные файлы обновлены!');
  }
} catch (error) {
  console.error('❌ Ошибка:', error.message);
  process.exit(1);
}









