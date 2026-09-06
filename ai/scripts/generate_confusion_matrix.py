import os
import matplotlib.pyplot as plt
import numpy as np

# Verified evaluation values from docs/ai/premium_validation_report.md
# TN = 128 (Bona-fide correctly classified as Bona-fide)
# FP = 22  (Bona-fide incorrectly classified as Spoof)
# FN = 40  (Spoof incorrectly classified as Bona-fide)
# TP = 110 (Spoof correctly classified as Spoof)
# Total = 300 samples (150 Bona-fide, 150 Spoof)
# Threshold theta = 0.93

cm = np.array([
    [128, 22],
    [40, 110]
])

accuracy = (128 + 110) / 300.0  # 79.33%
precision = 110 / (110 + 22)    # 83.33%
recall = 110 / (110 + 40)       # 73.33%
f1 = 2 * (precision * recall) / (precision + recall) # 78.01%

fig, ax = plt.subplots(figsize=(7, 6), dpi=300)

cax = ax.matshow(cm, cmap=plt.cm.Blues, alpha=0.85)

for i in range(2):
    for j in range(2):
        val = cm[i, j]
        label = f"{val}\n"
        if i == 0 and j == 0:
            label += "(True Negative)"
        elif i == 0 and j == 1:
            label += "(False Positive)"
        elif i == 1 and j == 0:
            label += "(False Negative)"
        elif i == 1 and j == 1:
            label += "(True Positive)"
            
        color = "white" if val > 100 else "black"
        ax.text(x=j, y=i, s=label, va='center', ha='center', size=12, fontweight='bold', color=color)

fig.colorbar(cax, fraction=0.046, pad=0.04)

classes = ['Bona-fide (Human)', 'Spoof (Clone)']
ax.set_xticks([0, 1])
ax.set_yticks([0, 1])
ax.set_xticklabels(classes, fontsize=11, fontweight='semibold')
ax.set_yticklabels(classes, fontsize=11, fontweight='semibold')

ax.set_xlabel('Predicted Label', fontsize=12, fontweight='bold', labelpad=10)
ax.set_ylabel('Ground Truth Label', fontsize=12, fontweight='bold', labelpad=10)
ax.set_title('VOXSHIELD Deepfake Detection Confusion Matrix\n(EER Threshold θ = 0.93 | N = 300)', fontsize=13, fontweight='bold', pad=20)

plt.figtext(0.5, 0.02, f"Accuracy: {accuracy:.2%} | Precision: {precision:.2%} | Recall: {recall:.2%} | F1-Score: {f1:.2%}",
            ha="center", fontsize=10, bbox={"boxstyle": "round,pad=0.5", "facecolor": "#f0f4f8", "edgecolor": "#cbd5e1"})

plt.tight_layout()
os.makedirs("docs/assets", exist_ok=True)
output_path = "docs/assets/confusion_matrix.png"
plt.savefig(output_path, dpi=300, bbox_inches='tight')
print(f"Confusion matrix successfully saved to: {output_path}")
