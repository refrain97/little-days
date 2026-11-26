# 安装、迁移与双人共享

手机打开小日子，iPhone 在 Safari 分享菜单选「添加到主屏幕」，Android 使用浏览器的安装入口。首次联网打开后，可以离线记事，恢复联网后再同步。[打开小日子](https://refrain97.github.io/little-days/)

| 当前配置 | 位置 |
| --- | --- |
| 公开代码、Pages 发布 | [refrain97/little-days](https://github.com/refrain97/little-days) |
| 本人多设备共享 | 私有仓库 `refrain97/little-days-data`，由 `refrain97` 账号授权 |

## 先迁移原有的本机手记

如果此前在 localhost 或局域网版记过东西，请先完成这三步。原网址和 Pages 各自有一份浏览器存储。

1. 在**原来的浏览器、原来的网址**打开「我的小天地 → 导出完整备份」，妥善保存 JSON。它可能含手记、照片、原声、私密事项与归档。
2. 在准备长期使用的 Pages 网页或主屏幕 App 打开「我的小天地 → 导入备份」。看清数量后点「确认替换并恢复」。如果目标位置已经有记录，先另行备份。检查一条旧手记及其照片或原声，并确认清单和归档也在。
3. 连接私库前检查「一起看」「仅自己」标记。只在自己的设备恢复个人完整备份；第二位使用者通过同步接收共享内容。PAT 和 AI 密钥要在新位置另行配置。

## 本人先在两台设备上用

1. 用 `refrain97` 登录 GitHub，在 **Settings → Developer settings → Personal access tokens → Fine-grained tokens** 创建令牌。**Resource owner** 选 `refrain97`，**Only select repositories** 只勾选 `little-days-data`。设定到期日，给 **Contents** 授予 **Read and write**，保留自动提供的 **Metadata** 只读权。每台设备可以用单独的令牌，便于单独撤销。[GitHub 令牌设置](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens#creating-a-fine-grained-personal-access-token)
2. 在每台设备的「我的小天地」中填写 `refrain97/little-days-data`、本人的昵称、头像首字和该设备的令牌，点击连接。应用自动识别默认分支。
3. 在设备 A 保存一条「一起看」记录，点「立即同步」。设备 B 同步后应能看到同一条记录。「仅自己」留在创建它的设备上。

## 第二位独立账号加入

GitHub 的细粒度令牌目前限制 repository collaborator 和 outside collaborator 向仓库贡献内容。两人长期共同写入时，可以把**数据仓库**放在同一组织，邀请两人成为**组织正式成员**，授予该私库 **Write** 权限。公开代码仓和手机安装地址可继续使用现在的位置。[GitHub 细粒度令牌限制](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens#fine-grained-personal-access-tokens-limitations)

1. 在旧空间完成最后一次同步并导出本人备份，随后断开旧连接。选择将现有私库转移到共同组织，或在组织中新建私库。转移会保留 Git 历史；新建时勾选 **Add a README file**，用初始提交建立默认分支，另用本人备份迁移当前内容。[仓库转移](https://docs.github.com/en/repositories/creating-and-managing-repositories/transferring-a-repository) · [空仓库的 Git 引用限制](https://docs.github.com/en/rest/git/refs#create-a-reference)
2. **已绑定过个人私库的设备**，用另一个浏览器、全新浏览器资料或新设备打开同一 Pages 地址。断开连接只移除凭据，原资料仍绑定旧的 `owner/repo@branch`。仓库转移后 owner 已改变，同一浏览器里的另一个标签页也会读到旧绑定。
3. 在新资料中，本人如需保留私密内容，先导入自己的备份，再连接 `组织名/私库名`。新建私库时，由一台已恢复的设备先同步共享内容；转移来的私库已有共享文件。第二位使用者在自己的空白资料里直接连接组织私库。
4. 两位成员分别以自己的 GitHub 身份创建令牌，**Resource owner** 选该组织，只授权该私库的 **Contents** 读写权。各填本人的昵称及令牌；若组织要求审批，等管理员批准后再同步。使用一条临时共享记录验证双方可读写，确认后妥善保留旧备份。

## 共享范围、回收站与 AI

- 数据仓库的 `shared/entries/`、`shared/places/`、`shared/freetime/` 分别保存共享手记、店铺、清单，附件存于 `shared/photos/` 和 `shared/audio/`。有私库读取权限的成员可以直接查看这些文件。
- 已共享内容改为「仅自己」后，下次成功同步会撤回分支当前版本中的共享内容。回收站 `shared/trash/` 中的修改快照和删除项目保留 30 天，到期后在下一次同步清理。应用关闭期间不会执行清理。Git 旧提交、克隆和对方已有的备份仍可能含旧副本。误传密钥时应先撤销或轮换。[GitHub 敏感数据清除指南](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository)
- 可选的 AI 接口、模型和个人 API Key 在「我的小天地」配置。只有「一起看」记录可主动调用云 AI，确认本次内容和接收方后才发送。PAT 和 API Key 仅保存在配置它们的设备，排除在共享数据、完整备份和静态发布文件之外。

## 在其他 GitHub 账号从零部署

1. 在 GitHub 的 **New repository** 新建 **Public** 代码仓库，默认分支用 `main`。把本项目源码、内置示例素材及 `.github/workflows/deploy.yml` 提交并推送到该仓库。项目自带的 `.gitignore` 将个人备份、测试截图和本地凭据排除在分发文件之外。
2. 再建一个 **Private** 数据仓库，勾选 **Add a README file**，其余文件由应用首次连接时建立。两位独立账号使用时，按上文「第二位独立账号加入」在共同组织下建库并设置成员权限。
3. 在公开代码仓启用下述 Pages 工作流。手机首次连接时填入自己的私库名，应用会验证仓库可见性与写入权限。

## 更新网页版本

在代码仓的 **Settings → Pages → Source** 选择 **GitHub Actions**。推送到 `main`，或在 **Actions → Deploy Little Days to GitHub Pages → Run workflow** 选 `main`。工作流会把 `dist/` 部署到 Pages，并将公开代码仓名称写入页面。提交前检查待提交文件，手记备份、个人附件和密钥应留在公开代码仓之外。[GitHub Pages 自定义工作流](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)

本机可用 `npm run build` 和 `npm run preview -- --base /little-days/ --port 5188` 检查仓库子路径。静态缓存按站点路径与版本区分，只缓存公开应用文件。相同 `OWNER.github.io` 下的多个页面共享浏览器来源，请在本人信任同一来源下所有应用时连接私库，或使用独立域名。
