import tasks = require("azure-pipelines-task-lib/task");
import { IExecOptions, ToolRunner } from "azure-pipelines-task-lib/toolrunner";
import { TerraformCommand, TerraformInterfaces, ITerraformProvider, ITaskAgent } from "./terraform";
import { injectable, inject } from "inversify";
import { IHandleCommandString } from "./command-handler";

export class TerraformApply extends TerraformCommand{
    readonly secureVarsFile: string | undefined;
    readonly environmentServiceName: string;

    constructor(
        name: string, 
        workingDirectory: string,
        environmentServiceName: string, 
        secureVarsFile: string | undefined,
        options?: string) {
        super(name, workingDirectory, options);
        this.environmentServiceName = environmentServiceName;
        this.secureVarsFile = secureVarsFile;
    }
}

@injectable()
export class TerraformApplyHandler implements IHandleCommandString{
    private readonly terraformProvider: ITerraformProvider;
    private readonly taskAgent: ITaskAgent;

    constructor(
        @inject(TerraformInterfaces.ITerraformProvider) terraformProvider: ITerraformProvider,
        @inject(TerraformInterfaces.ITaskAgent) taskAgent: ITaskAgent
    ) {
        this.terraformProvider = terraformProvider;           
        this.taskAgent = taskAgent;     
    }

    public async execute(command: string): Promise<number> {
        let autoApprove: string = '-auto-approve';
        let commandOptions: string = tasks.getInput("commandOptions") || autoApprove;
        if(commandOptions.includes(autoApprove) === false){
            commandOptions = `${autoApprove} ${commandOptions}`;
        }
        let secureVarsFile: string = tasks.getInput("secureVarsFile");
        if(secureVarsFile){
            let secureVarsFilePath: string = await this.getSecureVarsFilePath(secureVarsFile);
            commandOptions = `-var-file=${secureVarsFilePath} ${commandOptions}`;
        }

        let init = new TerraformApply(
            command,
            tasks.getInput("workingDirectory"),
            tasks.getInput("environmentServiceName", true),
            secureVarsFile,
            commandOptions
        );
        return this.onExecute(init);
    }

    private async onExecute(command: TerraformApply): Promise<number> {
        let terraform: ToolRunner = this.terraformProvider.create(command);
        this.setupAzureRmProvider(command, terraform);
        return terraform.exec(<IExecOptions>{
            cwd: command.workingDirectory
        });
    }

    private getSecureVarsFilePath(secureVarsFile: string): Promise<string>{
        return this.taskAgent.downloadSecureFile(secureVarsFile);
    }

    private setupAzureRmProvider(command: TerraformApply, terraform: ToolRunner){
        if(command.environmentServiceName){
            let scheme = tasks.getEndpointAuthorizationScheme(command.environmentServiceName, true);
            if(scheme != "ServicePrincipal"){
                throw "Terraform only supports service principal authorization for azure";
            }

            process.env['ARM_SUBSCRIPTION_ID']  = tasks.getEndpointDataParameter(command.environmentServiceName, "subscriptionid", false);
            process.env['ARM_TENANT_ID']        = tasks.getEndpointAuthorizationParameter(command.environmentServiceName, "tenantid", false);
            process.env['ARM_CLIENT_ID']        = tasks.getEndpointAuthorizationParameter(command.environmentServiceName, "serviceprincipalid", false);
            process.env['ARM_CLIENT_SECRET']    = tasks.getEndpointAuthorizationParameter(command.environmentServiceName, "serviceprincipalkey", false);
        }
        
    }
}