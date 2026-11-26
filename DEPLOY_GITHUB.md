# 用 GitHub Pages 打开小日子

准备一个发布网页的**公开代码仓库**，以及一个只向使用者开放的**私有数据仓库**。两台手机各自配置访问凭据，连接同一个数据仓库，应用自动使用其默认分支。

## 发布网页

1. 新建公开代码仓库，默认分支设为 `main`。将本项目源码、内置示例素材和 `.github/workflows/deploy.yml` 提交到这里。先查看 `git status --short` 和待提交文件列表，特别留意手记备份、截图和密钥。项目的 `.gitignore` 放行应用代码、列出的示例图与部署文件。
2. 在代码仓库进入 **Settings → Pages → Build and deployment → Source**，选 **GitHub Actions**。
3. 推送到 `main`，或在 **Actions → Deploy Little Days to GitHub Pages → Run workflow** 选择 `main`。构建步骤生成静态目录 `dist/`，部署任务把该目录发送到 `github-pages` 环境。工作流使用 GitHub 自动签发的短期权限。
4. 工作流成功后，在部署摘要或 **Settings → Pages** 打开 HTTPS 网站。项目站点的地址通常是 `https://OWNER.github.io/REPO/`，用户或组织主页仓库、自定义域名也可从网站根目录运行。[GitHub Pages 自定义工作流](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)

构建会把代码仓库名写入公开页面，以帮助应用阻止选择它作为数据仓库。在自定义域名手动构建时，可以运行 `LITTLE_DAYS_CODE_REPO=OWNER/CODE-REPO npm run build`。此变量只填写仓库名。令牌及 AI 密钥在设备设置中填写。

同一 `OWNER.github.io` 下的多个项目共用浏览器来源，路径级的离线缓存隔离不能充当账号或凭据的安全边界。请将带个人凭据的安装放到独立域名，或仅在本人信任同一来源下所有应用时连接数据仓库。

## 建立私有数据仓库

1. 若两人分别使用细粒度令牌，可在一个共同的 GitHub 组织中建库。让两位使用者成为该组织的正式成员。
2. 在该组织下新建 **Private** 仓库，勾选 **Add a README file**。README 所在的首个提交会建立默认分支。对于没有分支的空仓库，Git 引用接口无法创建引用。记下 `OWNER/REPO`；应用连接后自动识别默认分支。[GitHub Git 引用说明](https://docs.github.com/en/rest/git/refs#create-a-reference)
3. 在该私有仓库确认双方都具备 **Write** 权限，并让数据分支允许两人的正常提交。如果组织策略需要批准令牌，完成审批后再连接。该数据仓库可以从一份空 README 起步，应用会在使用时建立共享目录。

个人账号仓库中受邀的 repository collaborator，以及组织的 outside collaborator，目前受到 fine-grained PAT 的贡献限制。组织正式成员配合该仓的写入权限可避开此限制。每人都应使用自己的账号及令牌；令牌授予的权限仍受账号已有仓库权限约束。[GitHub 细粒度令牌及限制](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens#fine-grained-personal-access-tokens-limitations)

## 在两台手机连接

1. 两位使用者分别在自己的 GitHub 账号进入 **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**。
2. 设置合适的到期时间。**Resource owner** 选择数据仓库所属组织，**Repository access** 选择 **Only select repositories** 并勾选这个私有仓库。给 **Contents** 授予 **Read and write**，保留自动提供的 **Metadata** 只读权限。[GitHub 令牌配置说明](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens#creating-a-fine-grained-personal-access-token)
3. 各自在手机的 Pages 网站打开「我的小天地」，找到 GitHub 连接设置，填写相同的 `OWNER/REPO`、各自的昵称和头像首字，输入本人的令牌并连接。页面会读取默认分支，并将当前设备上的空间绑定到这个私库。以后在同一设备重新连接时，请使用之前绑定的仓库；更换设备时可在新设备上连接。此处也可查看同步状态及回收站。
4. 可用一条临时文字记录检查权限。选择「一起看」保存并同步，在第二台手机同步后查看；再创建一条「仅自己」检查它只在创建它的设备上出现。连接出现 403 或 404 时，核对仓库可见性、令牌资源所有者、成员身份、仓库读写权、批准状态与仓库是否已有默认分支。

共享手记写入 `shared/entries/`，店铺写入 `shared/places/`，清单写入 `shared/freetime/`，照片和可用的原声分别写入 `shared/photos/`、`shared/audio/`。可以读取私库的人也可以直接查看其中的共享内容。把已共享的记录改为「仅自己」后，下一次成功同步会撤回分支当前版本中的共享内容。另一人已经保存的备份、旧克隆及 Git 提交历史仍可能留有副本。完整备份含本机私密事项，应由各自另行保管。设备丢失或令牌泄露时，可从 GitHub 撤销对应令牌，再为保留的设备签发新令牌。

## 在本机配置可选 AI

需要识图、语音转写或文字整理时，在「我的小天地」填入提供方的 HTTPS 兼容接口、模型名及个人 API Key。仅「一起看」的记录可以使用云 AI。用户主动选择整理、看清发送的内容与接收方、确认发送后，浏览器才会把该项内容提交给选定服务。「仅自己」保留本地整理和原始附件。

GitHub PAT 与 AI API Key 只存于配置它们的设备，不进入 Pages 产物、共享仓库或完整备份。换手机或清除网站数据后，要分别重新配置。

## 回收站和 30 天

应用在 `shared/trash/` 保存历史快照和已删项目。30 天后，清理会在下一次实际执行同步时处理对应分支的当前文件。应用关闭期间不会执行后台清理。文件从当前版本消失后，旧内容仍可能留在 Git 提交历史、克隆和已有备份中。若曾误传真实密钥，应立即撤销或轮换；需要清除历史时，按 GitHub 的敏感数据流程与有克隆的成员协调。[GitHub 敏感数据清除指南](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository)

## 添加到主屏幕与离线

手机浏览器先联网打开一次网站，等待首页与静态资源载入。iPhone 可在 Safari 的分享菜单中选「添加到主屏幕」，Android 可使用浏览器的安装入口。离线可以打开已缓存的应用，新增记录并查看已有本机内容。恢复联网后再同步共享更改。

静态资源缓存以站点 scope 和构建版本分开，只保存当前版本的网页、程序、图标和示例图片。带认证头的请求、远端 API、共享仓库数据和 AI 请求均不加入这个缓存。
