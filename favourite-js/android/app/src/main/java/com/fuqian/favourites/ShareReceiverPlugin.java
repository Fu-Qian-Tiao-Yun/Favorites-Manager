package com.fuqian.favourites;

import android.content.Intent;
import android.net.Uri;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 接收系统分享（ACTION_SEND / ACTION_VIEW）并把分享内容转发给 WebView。
 *
 * 用法（前端）：
 *   const { ShareReceiver } = window.Capacitor?.Plugins ?? {}
 *   await ShareReceiver.getPendingShare()   // 启动时查询冷启动分享
 *   await ShareReceiver.addListener('shareReceived', (data) => {...})  // 热启动分享
 */
@CapacitorPlugin(name = "ShareReceiver")
public class ShareReceiverPlugin extends Plugin {

    /** 保存最近一次分享内容，供前端冷启动后主动拉取 */
    private JSObject pendingShare = null;

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        JSObject share = extractShare(intent);
        if (share != null) {
            pendingShare = share;
            notifyListeners("shareReceived", share);
        }
    }

    /** 冷启动：Activity 的 onCreate 已由 Bridge 处理，onCreate 时 Intent 也可能带分享 */
    @Override
    public void load() {
        super.load();
        JSObject share = extractShare(bridge.getIntents().get(0));
        if (share != null) {
            pendingShare = share;
        }
    }

    /** 前端启动后主动查询待处理的分享 */
    @PluginMethod
    public void getPendingShare(PluginCall call) {
        JSObject result = pendingShare != null ? pendingShare : new JSObject();
        call.resolve(result);
        // 拉取即消费，避免重复弹出
        pendingShare = null;
    }

    private JSObject extractShare(Intent intent) {
        if (intent == null) return null;
        String action = intent.getAction();
        String type = intent.getType();
        JSObject ret = new JSObject();

        if (Intent.ACTION_SEND.equals(action) && type != null) {
            if ("text/plain".equals(type)) {
                String sharedText = intent.getStringExtra(Intent.EXTRA_TEXT);
                if (sharedText != null && !sharedText.isEmpty()) {
                    ret.put("text", sharedText);
                    return ret;
                }
            }
        } else if (Intent.ACTION_VIEW.equals(action)) {
            Uri data = intent.getData();
            if (data != null) {
                ret.put("text", data.toString());
                return ret;
            }
        }
        return null;
    }
}
