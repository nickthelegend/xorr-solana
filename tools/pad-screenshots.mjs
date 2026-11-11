/** Render the real Pad and TabBar components without requiring an auth-provider login.
 * No external services are mocked and no signal/quote/receipt data is supplied.
 */
import { writeFile, unlink, mkdir } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
const entry = 'tools/.pad-visual.tsx';
const port = 8722;
const log = createWriteStream('/tmp/xorr-pad-visual.log');
const source = `import React from 'react';
import { AppRegistry, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import Pad from '../app/(tabs)/pad';
import { TabBar, colors } from '../src/ui';
function Preview() {
 const [loaded] = useFonts({
 'Inter-Regular':require('../assets/fonts/Inter-Regular.ttf'),
 'Inter-Medium':require('../assets/fonts/Inter-Medium.ttf'),
 'Inter-SemiBold':require('../assets/fonts/Inter-SemiBold.ttf'),
 'Inter-Bold':require('../assets/fonts/Inter-Bold.ttf'),
 'Inter-ExtraBold':require('../assets/fonts/Inter-ExtraBold.ttf')});
 if(!loaded) return null;
 const before = location.search.includes('before');
 return <SafeAreaProvider><View style={{flex:1,backgroundColor:colors.bg}}>
 {before ? <View style={{flex:1}}/> : <Pad/>}
 <TabBar testID="pad-tab-bar" active={before?'home':'pad'} onHome={()=>{}} onSwap={()=>{}} onMessages={()=>{}} {...(before?{}:{onPad:()=>{}})} />
 </View></SafeAreaProvider>;
}
AppRegistry.registerComponent('main',()=>Preview);
AppRegistry.runApplication('main',{rootTag:document.getElementById('root')});`;
let server, browser;
try {
 await writeFile(entry, source);
 server = spawn(process.execPath, ['node_modules/expo/bin/cli', 'start', '--web', '--port', String(port)], {
  env: { PATH:process.env.PATH, HOME:process.env.HOME, TMPDIR:process.env.TMPDIR, EXPO_NO_DOTENV:'1', EXPO_PUBLIC_XORR_CHAIN:'solana-devnet', CI:'1' }, stdio:['ignore','pipe','pipe'] });
 server.stdout.pipe(log); server.stderr.pipe(log);
 for(let n=0;n<120;n++) { try {if((await fetch(`http://localhost:${port}`)).ok) break;} catch {} await new Promise(r=>setTimeout(r,500)); }
 browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:402,height:874},deviceScaleFactor:1});
 await page.goto(`http://localhost:${port}/?before`);
 const html = `<html><style>html,body{height:100%;margin:0;background:#000}#root{display:flex;height:100%;flex:1}</style><div id="root"></div><script src="/tools/.pad-visual.bundle?platform=web&dev=true&hot=false&transform.engine=hermes"></script></html>`;
 await page.setContent(html);
 await page.getByRole('tab',{name:'Home',exact:true}).waitFor({timeout:120000});
 await mkdir('docs/pad/screenshots',{recursive:true});
 await page.getByTestId('pad-tab-bar').screenshot({path:'docs/pad/screenshots/before-tab-bar.png'});
 await page.goto(`http://localhost:${port}/?after`);
 await page.setContent(html);
 await page.getByText('Desk link',{exact:true}).waitFor({timeout:120000});
 await page.screenshot({path:'docs/pad/screenshots/after-pad.png'});
 await page.getByTestId('pad-tab-bar').screenshot({path:'docs/pad/screenshots/after-tab-bar.png'});
 await page.getByRole('button',{name:'Pair pad',exact:true}).click();
 await page.getByText('Setup required: a physical phone with a development build for Bluetooth',{exact:true}).waitFor();
 await page.screenshot({path:'docs/pad/screenshots/after-pad-setup.png'});
 console.log('Captured real components: before/after tab bar, Pad, and BLE setup state. No service fixtures.');
} finally {
 await browser?.close();
 if(server && server.exitCode===null) server.kill('SIGTERM');
 await unlink(entry).catch(()=>{});
 log.end();
}
