package com.mirkoalicastro.birdgame;

import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Color;

import com.badlogic.androidgames.framework.Game;
import com.badlogic.androidgames.framework.Graphics;
import com.badlogic.androidgames.framework.Input;
import com.badlogic.androidgames.framework.Screen;
import com.badlogic.androidgames.framework.impl.AndroidRectangularButton;

public class LobbyScreen extends Screen {
    private final Graphics graphics;
    private final AndroidRectangularButton playButton;
    private final AndroidRectangularButton quitButton;
    private int bestScore = 0;
    private float floatTime = 0;
    private int avatarFrame = 0;
    private long lastFrameSwitch = 0;

    public LobbyScreen(Game game) {
        super(game);
        graphics = game.getGraphics();

        // Load persisted high score from SharedPreferences
        try {
            Activity activity = (Activity) game;
            SharedPreferences prefs = activity.getSharedPreferences("BirdGamePrefs", Context.MODE_PRIVATE);
            bestScore = prefs.getInt("high_score", 0);
        } catch (Exception ignored) {
        }

        // Landscape 1920x1080 Layout:
        // Right side action panel
        int rightCenterX = 1420;
        int playW = 560;
        int playH = 150;
        int playX = rightCenterX - playW / 2;
        int playY = 400;

        playButton = new AndroidRectangularButton(graphics, playX, playY, playW, playH);
        playButton.setColor(Color.parseColor("#0284c7")); // Sky-600
        playButton.setStroke(6, Color.parseColor("#38bdf8"));

        int quitW = 560;
        int quitH = 110;
        int quitX = rightCenterX - quitW / 2;
        int quitY = 590;

        quitButton = new AndroidRectangularButton(graphics, quitX, quitY, quitW, quitH);
        quitButton.setColor(Color.parseColor("#334155")); // Slate-700
        quitButton.setStroke(5, Color.parseColor("#64748b"));
    }

    @Override
    public void update(float deltaTime) {
        floatTime += deltaTime * 3f;

        long now = System.currentTimeMillis();
        if (now - lastFrameSwitch > 200) {
            avatarFrame = (avatarFrame == 0) ? 1 : 0;
            lastFrameSwitch = now;
        }

        for (Input.TouchEvent event : game.getInput().getTouchEvents()) {
            if (event.type == Input.TouchEvent.TOUCH_UP) {
                if (playButton.inBounds(event)) {
                    game.setScreen(new GameScreen(game));
                    return;
                } else if (quitButton.inBounds(event)) {
                    ((Activity) game).finish();
                    return;
                }
            }
        }
    }

    @Override
    public void present(float deltaTime) {
        // Background Gradient
        if (Assets.backgroundGradient != null) {
            graphics.drawEffect(Assets.backgroundGradient, 0, 0, graphics.getWidth(), graphics.getHeight());
        } else {
            graphics.clear(Color.parseColor("#A8D5F4"));
        }

        // =======================================================
        // LEFT COLUMN: Branding, Floating Bird Avatar & Stats (x: 100 to 900)
        // =======================================================
        int leftCenterX = 520;

        // Title
        graphics.drawText("BIRD GAME", leftCenterX, 220, 100, Color.parseColor("#0f172a"), Graphics.TextAlign.CENTER);
        graphics.drawText("LiquidFun 2D Physics - Landscape Edition", leftCenterX, 280, 36, Color.parseColor("#334155"), Graphics.TextAlign.CENTER);

        // Pedestal card
        int cardW = 600;
        int cardH = 460;
        int cardX = leftCenterX - cardW / 2;
        int cardY = 340;
        graphics.drawRect(cardX, cardY, cardW, cardH, Color.parseColor("#80ffffff"));
        graphics.drawRectBorder(cardX, cardY, cardW, cardH, 4, Color.parseColor("#38bdf8"));

        // Floating Bird Avatar
        int floatingY = 520 + (int) (Math.sin(floatTime) * 20);
        if (Assets.avatar != null) {
            int frameW = 170;
            int frameH = 170;
            int srcX = avatarFrame * frameW;
            int drawSize = 220;
            graphics.drawPixmap(Assets.avatar, leftCenterX - drawSize / 2, floatingY - drawSize / 2, drawSize, drawSize, srcX, 0, frameW, frameH);
        }

        // High Score inside Pedestal Card
        graphics.drawText("★ HIGH SCORE: " + bestScore + " ★", leftCenterX, 720, 48, Color.parseColor("#b45309"), Graphics.TextAlign.CENTER);

        // Footer hint
        graphics.drawText("Ready for flight?", leftCenterX, 760, 32, Color.parseColor("#64748b"), Graphics.TextAlign.CENTER);

        // =======================================================
        // RIGHT COLUMN: Actions & Controls (x: 1000 to 1800)
        // =======================================================
        int rightCenterX = 1420;

        // Header for actions
        graphics.drawText("PILOT CONTROLS", rightCenterX, 280, 48, Color.parseColor("#0f172a"), Graphics.TextAlign.CENTER);

        // Play Button
        playButton.draw();
        graphics.drawText("PLAY GAME", rightCenterX, 495, 62, Color.WHITE, Graphics.TextAlign.CENTER);

        // Quit Button
        quitButton.draw();
        graphics.drawText("EXIT APP", rightCenterX, 665, 46, Color.parseColor("#f1f5f9"), Graphics.TextAlign.CENTER);

        // Instructions Footer
        graphics.drawText("Tap anywhere on screen to flap wings & navigate obstacles", rightCenterX, 780, 32, Color.parseColor("#334155"), Graphics.TextAlign.CENTER);
        graphics.drawText("Survive as long as possible to set a new personal record", rightCenterX, 825, 28, Color.parseColor("#64748b"), Graphics.TextAlign.CENTER);
    }

    @Override
    public void pause() {
    }

    @Override
    public void resume() {
    }

    @Override
    public void dispose() {
    }

    @Override
    public void back() {
        ((Activity) game).finish();
    }
}
