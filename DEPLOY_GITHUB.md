# 小日子 · 两台 iPhone 共用一本手账

网页从公开代码仓部署，共享内容保存在单独的私有仓库。当前项目的代码仓是 `refrain97/little-days`，现有个人数据仓是 `refrain97/little-days-data`。[打开小日子](https://refrain97.github.io/little-days/)

## 1. 准备两个仓库

1. **代码仓选 Public。** Fork 本项目，或将前端源码、内置示例和工作流提交到自己的 `main`。只把应用文件放在代码仓，个人备份与照片留在设备或数据私库。
2. **数据仓选 Private。** 新建一个私库，如 `little-days-data`，勾选 **Add a README file** 建立默认分支。本人在两台设备使用，可选自己的现有私库。
3. **两个人各用自己的账号时**，建议在共同的 GitHub Free 组织中建数据私库，让双方成为组织成员，授予该库 **Write** 权限。GitHub 对细粒度令牌与外部协作者有使用限制。每个人用自己的令牌，方便独立撤销。[GitHub 细粒度令牌限制](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens#fine-grained-personal-access-tokens-limitations)

## 2. 开启 GitHub Pages

在**公开代码仓**进入 **Settings → Pages → Build and deployment → Source → GitHub Actions**。推送 `main` 后，工作流先跑单元测试与手机验收，再发布 `dist/`。在 **Actions → Deploy Little Days to GitHub Pages → deploy** 可打开上线地址。仓库子路径和 `#home`、`#kitchen`、`#free` 都支持直接打开和刷新。[Pages 工作流](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)

## 3. 每人创建一个专用令牌

1. 在 GitHub 进入 **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**。
2. 填写便于辨认的名称与到期日。**Resource owner** 选择拥有**数据私库**的账号或组织。**Repository access → Only select repositories** 只勾这个私库。
3. **Repository permissions → Contents** 选择 **Read and write**，保留自动勾选的 **Metadata / Read-only**，其余权限留空。组织若要求审批，须先批准令牌。生成后在对应手机输入，令牌不需要发给另一个人、提交到 GitHub 或填入 Actions Secrets。[GitHub 官方步骤](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens#creating-a-fine-grained-personal-access-token)

## 4. 两台 iPhone 分别设置

1. 在 Safari 打开 Pages 地址，点**分享 → 添加到主屏幕**。如果有“作为网页 App 打开”选项，将其打开。接下来从桌面图标进入应用，确保配置保存在日常使用的浏览器空间。[iPhone 使用手册](https://support.apple.com/guide/iphone/turn-a-website-into-an-app-iph42ab2f3a7/ios)
2. 打开右上角设置或「我的小天地」，展开双人云空间，填写相同的 `组织或账号/私库名称`、本人的昵称、动物头像和本人的令牌，点「验证并连接」。本人在两台设备用同一账号，也可以给两台手机分别签发令牌。
3. 在手机 A 写一条「一起看」的手记，放一张照片。手机 B 打开同一空间查看并盖个章，A 再同步即可看见回应。日常会自动同步，也可以在设置点「立即同步」。两部手机的 PAT 和可选 AI Key 仅保存在各自本机的 localStorage。
4. 如果旧记录在本机预览、其他域名或独立的 Safari 存储中，先在旧位置导出完整备份，再在准备长期使用的主屏幕应用导入。完整导入会替换目标账本，请先备份。已绑定的浏览器资料会记住所属数据仓，迁往另一个仓时请使用新的浏览器资料并从备份迁移。

## 日常使用与恢复

| 情况 | 应用行为或操作 |
| --- | --- |
| 共享手记、店铺、待办和早餐点子 | 分别存于 `shared/entries/`、`shared/places/`、`shared/freetime/`、`shared/breakfast/`，每条一个 JSON。照片和缩略图在 `shared/photos/` 和 `shared/thumbs/`，原声在 `shared/audio/`。 |
| 断网、令牌到期 | 可以继续记录，文字、图片与待同步改动先落地 IndexedDB。联网后自动重试；遇到 401，按「更新 Token」换入同一私库的新令牌，等待中的改动会继续上传。 |
| 改错或误删共享内容 | 在设置进入「回收站」，选对应版本点「恢复」。旧版本和已删除记录保留 30 天，过期项目在下次成功同步时清理。 |
| 「仅自己」与备份 | 私密内容只保存在当前设备。用「导出私人备份」将自包含 JSON 存到“文件”，再点「文件已保存」。超过 14 天会轻提醒。「导入私人备份」合并私人记录及附件。 |
| 已共享内容改为仅自己 | 下次成功同步会撤回当前分支中的该项。Git 历史、伙伴已另存的文件与旧备份可能保留之前公开给伙伴的版本。 |
| 可选 AI | 在本机设置接口地址、模型和 Key。主动识别并同意后，所选共享素材会发送给指定 AI 接口。基础拍照、录音、打字、系统键盘听写和保存可独立使用。 |

同一 `OWNER.github.io` 下的项目共享网页来源和浏览器存储，连接令牌的设备应信任该来源下部署的应用。
